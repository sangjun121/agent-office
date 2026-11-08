// 작업실 3D 모델. 가구, 벽, 충돌 상자, 좌석, 구역, 상호작용 지점을 만든다.
// 좌표: x는 동쪽(→), z는 남쪽(↓), 1칸 = 1. 방은 x 0~16, z 0~12.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, rng, codeScreenTexture, FONT_HAND, FONT_BODY } from './tex.js';
import { damp } from './util.js';
import { brand, drawMark } from './brand.js';

export const W = 16;
export const D = 12;
export const WALL_H = 2.6;
const PI = Math.PI;

// ---------- 재료, 도형 도우미 ----------
const mats = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra });
    mats.set(key, m);
  }
  return m;
}
const geos = new Map();
function rgeo(w, h, d, r) {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 0.002);
  const key = `${w}|${h}|${d}|${rr}`;
  let g = geos.get(key);
  if (!g) {
    g = rr > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
    geos.set(key, g);
  }
  return g;
}
// 바닥 가운데가 (x, y, z)에 놓이는 상자
function box(parent, w, h, d, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(rgeo(w, h, d, o.r ?? 0.025), o.m || mat(color, o.mat));
  m.position.set(x, y + h / 2, z);
  if (o.ry) m.rotation.y = o.ry;
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 18), o.m || mat(color, o.mat));
  // 눕힌 원기둥은 y가 가운데, 세운 원기둥은 y가 바닥
  m.position.set(x, o.rx || o.rz ? y : y + h / 2, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function ball(parent, r, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, o.seg || 18, o.seg2 || 12), o.m || mat(color, o.mat));
  m.position.set(x, y, z);
  if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function plane(parent, w, h, material, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const texMat = (t, extra) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, ...extra });
const glowMat = (t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false });

// 움직이지 않는 메쉬를 재료별로 합쳐 그리기 호출 수를 줄인다
function mergeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.keep) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: o.material, cast: o.castShadow, geos: [] }));
    b.geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    group.add(m);
  }
}

// ---------- 그림 텍스처 ----------
function drawFloor(g, w, h) {
  const n = 8;
  const s = w / n;
  const R = rng(7);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#E4DCCD' : '#D9D0BF';
      g.fillRect(i * s, j * s, s, s);
    }
  for (let k = 0; k < 900; k++) {
    g.fillStyle = R() < 0.5 ? 'rgba(120,100,80,.10)' : 'rgba(255,255,255,.18)';
    g.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 3);
  }
  g.strokeStyle = 'rgba(110,95,75,.22)';
  g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, h);
    g.moveTo(0, i * s);
    g.lineTo(w, i * s);
    g.stroke();
  }
}

function drawSky(g, w, h, hour) {
  const night = hour < 6 || hour >= 19;
  const dusk = hour >= 17 && hour < 19;
  const grd = g.createLinearGradient(0, 0, 0, h);
  if (night) {
    grd.addColorStop(0, '#0F1B3A');
    grd.addColorStop(1, '#2C3E6B');
  } else if (dusk) {
    grd.addColorStop(0, '#5B6DB5');
    grd.addColorStop(0.55, '#F29E7B');
    grd.addColorStop(1, '#FFD59A');
  } else {
    grd.addColorStop(0, '#7CC4F2');
    grd.addColorStop(1, '#DDF1FB');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const R = rng(3);
  if (night) {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,230,${0.4 + R() * 0.6})`;
      g.fillRect(R() * w, R() * h * 0.6, 2, 2);
    }
    g.fillStyle = '#FFF4C8';
    g.beginPath();
    g.arc(w * 0.8, h * 0.2, 12, 0, PI * 2);
    g.fill();
  } else {
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 5; i++) {
      const cx = R() * w;
      const cy = 18 + R() * h * 0.35;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(cx + k * 13, cy + (k % 2) * 4, 11 + R() * 6, 0, PI * 2);
        g.fill();
      }
    }
  }
  // 멀리 보이는 캠퍼스 건물
  let x = 0;
  while (x < w) {
    const bw = 30 + R() * 50;
    const bh = h * (0.18 + R() * 0.32);
    g.fillStyle = night ? '#1A2440' : dusk ? '#8A6F86' : '#A9BCCB';
    g.fillRect(x, h - bh, bw - 4, bh);
    for (let wy = h - bh + 6; wy < h - 6; wy += 9)
      for (let wx = x + 4; wx < x + bw - 10; wx += 8) {
        if (night) g.fillStyle = R() < 0.45 ? '#FFD98A' : '#22305A';
        else g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(wx, wy, 4, 5);
      }
    x += bw;
  }
  g.fillStyle = night ? '#16301F' : '#6FAE6B';
  for (let i = 0; i < w; i += 14) {
    g.beginPath();
    g.arc(i, h - 2, 12 + R() * 6, 0, PI * 2);
    g.fill();
  }
}

function drawBanner(g, w, h, banner = {}) {
  g.fillStyle = '#22594A';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#F3E3C3';
  g.lineWidth = 6;
  g.setLineDash([16, 10]);
  g.strokeRect(10, 10, w - 20, h - 20);
  g.setLineDash([]);
  g.textBaseline = 'middle';
  g.fillStyle = '#FF8A3D';
  g.font = `bold 92px ${FONT_HAND}`;
  const title = banner.title || 'Agent Office';
  g.fillText(title, 44, h / 2 + 4);
  const tx = Math.max(250, 44 + g.measureText(title).width + 40);
  g.fillStyle = '#F7F1E3';
  g.font = `56px ${FONT_HAND}`;
  g.fillText(banner.sub || '끝나면 보고하러 와요', tx, h / 2 + 4);
}

function drawCork(g, w, h) {
  g.fillStyle = '#C9A57B';
  g.fillRect(0, 0, w, h);
  const R = rng(11);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(120,80,40,.18)' : 'rgba(255,230,190,.18)';
    g.fillRect(R() * w, R() * h, 3, 3);
  }
  const pin = (x, y, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, 9, 0, PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath();
    g.arc(x - 3, y - 3, 3, 0, PI * 2);
    g.fill();
  };
  const polaroid = (x, y, rot, sky, cap, people) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(-86, -96, 180, 206);
    g.fillStyle = '#FFFFFF';
    g.fillRect(-90, -100, 180, 206);
    g.fillStyle = sky;
    g.fillRect(-78, -88, 156, 140);
    g.fillStyle = '#7CC08A';
    g.fillRect(-78, 22, 156, 30);
    for (let i = 0; i < people; i++) {
      const px = -60 + i * (120 / Math.max(1, people - 1));
      g.fillStyle = ['#FF8A3D', '#3D6FD8', '#F6A6C1', '#3FA66B', '#8E6CCF'][i % 5];
      g.fillRect(px - 12, 0, 24, 30);
      g.fillStyle = '#FFE6D2';
      g.beginPath();
      g.arc(px, -10, 13, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = '#333';
    g.font = `28px ${FONT_HAND}`;
    g.textAlign = 'center';
    g.fillText(cap, 0, 88);
    g.restore();
    pin(x, y - 92, '#E5484D');
  };
  const note = (x, y, rot, color, lines, size = 30) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,.15)';
    g.fillRect(-96, -86, 200, 180);
    g.fillStyle = color;
    g.fillRect(-100, -90, 200, 180);
    g.fillStyle = '#3B342C';
    g.font = `${size}px ${FONT_HAND}`;
    lines.forEach((l, i) => g.fillText(l, -84, -46 + i * (size + 8)));
    g.restore();
    pin(x, y - 82, '#3D6FD8');
  };
    polaroid(130, 150, -0.08, '#8CCBF2', '팀 워크숍 🌊', 4);
  polaroid(330, 160, 0.06, '#F7C59F', '회식 🍕', 5);
  polaroid(150, 420, 0.05, '#2C3E6B', '배포 성공 🚀', 3);
  g.save();
  g.translate(520, 390);
  g.rotate(-0.04);
  g.fillStyle = '#F1EEE6';
  g.fillRect(-140, -110, 280, 220);
  g.fillStyle = '#222';
  g.font = `bold 30px ${FONT_BODY}`;
  g.fillText('이번 주 릴리즈 🎉', -122, -66);
  g.font = `22px ${FONT_BODY}`;
  g.fillStyle = '#555';
  g.fillText('머지된 PR 12개', -122, -30);
  g.fillText('고친 버그 7개', -122, 0);
  g.fillStyle = '#BBB';
  for (let i = 0; i < 4; i++) g.fillRect(-122, 30 + i * 18, 240 - (i % 2) * 40, 8);
  g.restore();
  pin(520, 290, '#FFD15C');
  note(760, 150, 0.05, '#FFE58A', ['오늘 할 일', '· PR 리뷰', '· 배포 준비', '· 회고 쓰기'], 30);
  note(800, 400, -0.06, '#FFC2D4', ['배포는', '금요일 피하기!'], 30);
  note(330, 430, 0.03, '#BDEBCB', ['테스트 먼저 ✅', '커밋은 작게'], 30);
}

function drawPoster(g, w, h) {
  g.fillStyle = '#FBF8F1';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#22594A';
  g.font = `bold 64px ${FONT_HAND}`;
  g.textAlign = 'center';
  g.fillText('1일 1커밋', w / 2, 92);
  const R = rng(5);
  const greens = ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'];
  const cols = 12;
  const rows = 7;
  const s = 22;
  const ox = (w - cols * (s + 4)) / 2;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      g.fillStyle = greens[Math.floor(R() * R() * 5 + (c > 8 ? 1 : 0)) % 5];
      g.fillRect(ox + c * (s + 4), 140 + r * (s + 4), s, s);
    }
  g.fillStyle = '#555';
  g.font = `34px ${FONT_HAND}`;
  g.fillText('오늘도 커밋 하나 ✓', w / 2, 400);
  g.font = `22px ${FONT_BODY}`;
  g.fillText(brand.posterFoot, w / 2, 450);
}

function drawGroupPhoto(g, w, h) {
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#9ED3F5');
  grd.addColorStop(0.7, '#E8F6FD');
  g.fillStyle = grd;
  g.fillRect(16, 16, w - 32, h - 90);
  g.fillStyle = '#86C98C';
  g.fillRect(16, h - 150, w - 32, 76);
  const colors = ['#FF8A3D', '#3D6FD8', '#F6A6C1', '#3FA66B', '#8E6CCF', '#FFD15C', '#E5484D', '#7FD8BE'];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 6; i++) {
      const x = 70 + i * 74 + row * 36;
      const y = 150 + row * 60;
      g.fillStyle = colors[(i + row * 3) % colors.length];
      g.fillRect(x - 22, y + 10, 44, 54);
      g.fillStyle = '#FFE6D2';
      g.beginPath();
      g.arc(x, y, 24, 0, PI * 2);
      g.fill();
      g.fillStyle = '#2B2422';
      g.beginPath();
      g.arc(x, y - 8, 24, PI, 0);
      g.fill();
      g.fillStyle = '#222';
      g.fillRect(x - 9, y, 4, 5);
      g.fillRect(x + 5, y, 4, 5);
    }
  g.fillStyle = '#333';
  g.font = `40px ${FONT_HAND}`;
  g.textAlign = 'center';
  g.fillText(brand.photoCaption, w / 2, h - 28);
}

function drawSign(g, w, h, lines, bg = '#FFE58A') {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#3B342C';
  g.textAlign = 'center';
  g.font = `${Math.floor(h / (lines.length + 1.6))}px ${FONT_HAND}`;
  lines.forEach((l, i) => g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1) + 12));
}

function drawFridgeInside(g, w, h) {
  g.fillStyle = '#EEF3F6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#C9D3DA';
  for (let i = 1; i < 4; i++) g.fillRect(0, (h / 4) * i, w, 6);
  const R = rng(9);
  const cans = ['#E5484D', '#3D6FD8', '#3FA66B', '#FFD15C', '#8E6CCF', '#FF8A3D'];
  for (let s = 0; s < 4; s++) {
    let x = 14;
    const base = (h / 4) * (s + 1);
    while (x < w - 30) {
      const tall = R() < 0.3;
      const cw = tall ? 26 : 30;
      const ch = tall ? 70 : 46;
      g.fillStyle = cans[Math.floor(R() * cans.length)];
      g.fillRect(x, base - ch, cw, ch);
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.fillRect(x + 4, base - ch + 6, 5, ch - 12);
      x += cw + 8 + R() * 10;
    }
  }
  g.fillStyle = '#FFF6B0';
  g.fillRect(w - 112, 14, 100, 56);
  g.fillStyle = '#C0392B';
  g.font = `20px ${FONT_HAND}`;
  g.fillText('손대지 마시오', w - 106, 40);
  g.fillText('🙅 푸딩 주인', w - 106, 62);
}

function drawClockFace(g, w) {
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(w / 2, w / 2, w / 2 - 4, 0, PI * 2);
  g.fill();
  g.fillStyle = '#333';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    const r1 = w / 2 - 18;
    g.save();
    g.translate(w / 2 + Math.sin(a) * r1, w / 2 - Math.cos(a) * r1);
    g.rotate(a);
    g.fillRect(-3, -10, 6, i % 3 ? 12 : 20);
    g.restore();
  }
  if (brand.mark === '✓') drawMark(g, w / 2, w / 2 + 46, 17, { bg: '#22594A' });
  else {
    g.fillStyle = '#22594A';
    g.font = `bold 28px ${FONT_HAND}`;
    g.textAlign = 'center';
    g.fillText(brand.mark, w / 2, w / 2 + 52);
  }
}

function drawTV(g, w, h, t, on) {
  if (!on) {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#15171C');
    grd.addColorStop(0.5, '#23262E');
    grd.addColorStop(1, '#121318');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    return;
  }
  // 작은 픽셀 레이싱 게임
  g.fillStyle = '#7EC8F5';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#FFE58A';
  g.fillRect(w - 26, 8, 12, 12);
  const off = (t * 40) % w;
  g.fillStyle = '#FFFFFF';
  for (let i = 0; i < 3; i++) g.fillRect(((i * 70 - off * 0.3) % (w + 40) + w + 40) % (w + 40) - 30, 14 + i * 6, 26, 7);
  g.fillStyle = '#5DB36A';
  for (let x = 0; x < w; x += 2) g.fillRect(x, h * 0.55 + Math.sin((x + off) * 0.06) * 4, 2, h);
  g.fillStyle = '#5A5F6B';
  g.beginPath();
  g.moveTo(w * 0.42, h * 0.55);
  g.lineTo(w * 0.58, h * 0.55);
  g.lineTo(w * 0.95, h);
  g.lineTo(w * 0.05, h);
  g.fill();
  g.fillStyle = '#FFFFFF';
  for (let i = 0; i < 6; i++) {
    const p = ((i / 6 + t * 0.9) % 1) ** 2;
    g.fillRect(w / 2 - 1 - p * 3, h * 0.55 + p * h * 0.45, 2 + p * 6, 2 + p * 5);
  }
  const bob = Math.sin(t * 9) * 1.5;
  const cx = w / 2 + Math.sin(t * 1.3) * 28;
  g.fillStyle = '#E5484D';
  g.fillRect(cx - 16, h * 0.78 + bob, 32, 14);
  g.fillStyle = '#FF8A3D';
  g.fillRect(cx - 10, h * 0.72 + bob, 20, 9);
  g.fillStyle = '#222';
  g.fillRect(cx - 18, h * 0.86 + bob, 8, 6);
  g.fillRect(cx + 10, h * 0.86 + bob, 8, 6);
  g.fillStyle = '#FFF';
  g.font = 'bold 9px monospace';
  g.fillText(`LAP ${1 + (Math.floor(t / 6) % 3)}/3`, 6, 12);
}

// ---------- 방 만들기 ----------
export function buildRoom(scene, { boardTexture, banner } = {}) {
  const root = new THREE.Group();
  root.name = 'dongbang';
  scene.add(root);
  const stat = new THREE.Group();
  root.add(stat);
  const R = rng(20261108);
  const colliders = [];
  const seats = [];
  const spots = [];
  const walls = [];
  const col = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });

  // 받침대와 바닥
  box(stat, W + 0.8, 0.5, D + 0.8, W / 2, -0.51, D / 2, '#4A3B32', { r: 0.1, cast: false });
  const floorTex = canvasTex(512, 512, drawFloor);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  floor.userData.keep = true;
  root.add(floor);

  // ---- 벽 ----
  function wall(name, cx, cz, len, alongX, inner) {
    const g = new THREE.Group();
    root.add(g);
    const body = new THREE.Group();
    const decor = new THREE.Group();
    g.add(body, decor);
    const t = 0.2;
    const sx = alongX ? len : t;
    const sz = alongX ? t : len;
    box(body, sx, WALL_H, sz, cx - (inner.x * t) / 2, 0, cz - (inner.z * t) / 2, '#F1EDE4', { r: 0.02, cast: false });
    const ix = (d) => cx + inner.x * d;
    const iz = (d) => cz + inner.z * d;
    const L = len - 0.02;
    box(body, alongX ? L : 0.03, 0.95, alongX ? 0.03 : L, ix(0.015), 0, iz(0.015), '#A8C5B2', { r: 0.008, cast: false });
    box(body, alongX ? L : 0.05, 0.04, alongX ? 0.05 : L, ix(0.025), 0.93, iz(0.025), '#7FA18E', { r: 0.008, cast: false });
    box(body, alongX ? L : 0.05, 0.1, alongX ? 0.05 : L, ix(0.025), 0, iz(0.025), '#6F8C7E', { r: 0.008, cast: false });
    const w = { name, group: g, body, decor, inner, cut: 0, target: 0 };
    walls.push(w);
    return w;
  }
  const north = wall('north', W / 2, 0, W + 0.4, true, { x: 0, z: 1 });
  const south = wall('south', W / 2, D, W + 0.4, true, { x: 0, z: -1 });
  const west = wall('west', 0, D / 2, D, false, { x: 1, z: 0 });
  const east = wall('east', W, D / 2, D, false, { x: -1, z: 0 });

  // 창문 (북쪽 벽)
  const skyTex = canvasTex(512, 256, (g, w, h) => drawSky(g, w, h, new Date().getHours()));
  const skyMat = glowMat(skyTex);
  for (const wx of [4.4, 7.1]) {
    box(north.decor, 2.5, 1.2, 0.07, wx, 0.92, 0.035, '#FAFAF7', { r: 0.02, cast: false });
    const glass = plane(north.decor, 2.36, 1.06, skyMat, wx, 1.52, 0.074);
    glass.userData.keep = true;
    box(north.decor, 0.05, 1.08, 0.03, wx, 0.98, 0.085, '#FAFAF7', { r: 0.01, cast: false });
    box(north.decor, 2.36, 0.04, 0.03, wx, 1.33, 0.085, '#FAFAF7', { r: 0.01, cast: false });
    box(north.decor, 2.62, 0.05, 0.18, wx, 0.87, 0.09, '#E9E4DA', { r: 0.015, cast: false });
    cyl(north.decor, 0.045, 0.045, 2.42, wx, 2.12, 0.12, '#EDE6D6', { rz: PI / 2, cast: false });
  }
  // 현수막
  const bannerTex = canvasTex(1536, 128, (g, w, h) => drawBanner(g, w, h, banner));
  const bannerMesh = plane(north.decor, 4.6, 0.38, texMat(bannerTex, { roughness: 1 }), 5.75, 2.36, 0.03);
  bannerMesh.userData.keep = true;
  ball(north.decor, 0.03, 3.5, 2.5, 0.05, '#E5484D', { cast: false });
  ball(north.decor, 0.03, 8.0, 2.5, 0.05, '#E5484D', { cast: false });

  // 화이트보드 (북쪽 벽)
  box(north.decor, 2.62, 1.68, 0.05, 10.5, 0.6, 0.025, '#B9BEC4', { r: 0.02, cast: false });
  const boardSurface = plane(
    north.decor,
    2.48,
    1.55,
    new THREE.MeshStandardMaterial({ map: boardTexture || null, color: boardTexture ? '#FFFFFF' : '#FBFBF8', roughness: 0.4 }),
    10.5,
    1.435,
    0.056,
  );
  boardSurface.userData.keep = true;
  box(north.decor, 1.3, 0.035, 0.1, 10.5, 0.55, 0.07, '#AEB3B9', { r: 0.01, cast: false });
  ['#222', '#3D6FD8', '#E5484D', '#3FA66B'].forEach((c, i) =>
    cyl(north.decor, 0.012, 0.012, 0.13, 10.1 + i * 0.16, 0.585, 0.08, c, { rz: PI / 2, cast: false, seg: 8 }),
  );

  // 시계 (책장 위)
  const clockTex = canvasTex(256, 256, (g, w) => drawClockFace(g, w));
  const clock = new THREE.Group();
  clock.userData.keep = true;
  clock.position.set(1.0, 2.24, 0.05);
  north.decor.add(clock);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), mat('#2F3A36'));
  rim.rotation.x = PI / 2;
  clock.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), texMat(clockTex, { roughness: 0.6 }));
  face.position.z = 0.026;
  clock.add(face);
  const hand = (len, wdt, color) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(wdt, len, 0.008), mat(color));
    m.position.y = len / 2 - 0.02;
    p.add(m);
    p.position.z = 0.034;
    clock.add(p);
    return p;
  };
  const hourHand = hand(0.1, 0.018, '#222');
  const minHand = hand(0.15, 0.012, '#222');
  const secHand = hand(0.16, 0.005, '#E5484D');

  // 포스터 (탕비 코너 위)
  const posterTex = canvasTex(384, 512, drawPoster);
  box(north.decor, 0.66, 0.86, 0.02, 13.5, 1.27, 0.012, '#2F3A36', { r: 0.005, cast: false });
  plane(north.decor, 0.6, 0.8, texMat(posterTex), 13.5, 1.7, 0.026).userData.keep = true;

  // 서쪽 벽: 코르크 게시판
  const corkTex = canvasTex(1024, 560, drawCork);
  box(west.decor, 0.05, 1.3, 2.32, 0.025, 0.95, 3.6, '#8C6B50', { r: 0.02, cast: false });
  plane(west.decor, 2.2, 1.2, texMat(corkTex, { roughness: 1 }), 0.055, 1.6, 3.6, PI / 2).userData.keep = true;

  // 남쪽 벽: 단체 사진, 에어컨 안내문
  const photoTex = canvasTex(512, 380, drawGroupPhoto);
  box(south.decor, 1.12, 0.84, 0.03, 4.3, 1.2, D - 0.015, '#3B342C', { r: 0.01, cast: false });
  plane(south.decor, 1.04, 0.77, texMat(photoTex), 4.3, 1.62, D - 0.034, PI).userData.keep = true;
  const signTex = canvasTex(320, 220, (g, w, h) => drawSign(g, w, h, ['나갈 때', '에어컨·불 끄기!']));
  plane(south.decor, 0.42, 0.29, texMat(signTex), 1.7, 1.55, D - 0.012, PI).userData.keep = true;

  // 동쪽 벽: 문, 문패, 스위치
  box(east.decor, 0.06, 2.16, 1.3, W - 0.03, 0, 10.8, '#E3DED3', { r: 0.01, cast: false });
  box(east.decor, 0.07, 2.06, 1.1, W - 0.05, 0, 10.8, '#7E95A8', { r: 0.015, cast: false });
  box(east.decor, 0.02, 0.5, 0.36, W - 0.09, 1.3, 10.8, '#BFD9EA', { r: 0.005, cast: false });
  cyl(east.decor, 0.025, 0.025, 0.16, W - 0.12, 0.98, 10.38, '#D9DCE0', { rx: PI / 2, cast: false });
  const plateTex = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#22594A';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#F7F1E3';
    g.font = `46px ${FONT_HAND}`;
    if (brand.mark === '✓') {
      drawMark(g, 80, h / 2, 50);
      g.fillText(brand.plateSub, 150, 100);
    } else {
      g.fillStyle = '#FF8A3D';
      g.font = `bold 84px ${FONT_HAND}`;
      g.fillText(brand.mark, 26, 104);
      g.fillStyle = '#F7F1E3';
      g.font = `46px ${FONT_HAND}`;
      g.fillText(brand.plateSub, 210, 100);
    }
  });
  plane(east.decor, 0.8, 0.25, texMat(plateTex), W - 0.012, 2.33, 10.8, -PI / 2).userData.keep = true;
  box(east.decor, 0.02, 0.12, 0.08, W - 0.01, 1.15, 9.95, '#F4F4F2', { r: 0.005, cast: false });

  // ---- 가구 도우미 ----
  const CHAIR_COLORS = ['#E07A5F', '#3D5A80', '#81B29A', '#F2CC8F', '#9C89B8'];
  function chair(x, z, h, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = h;
    stat.add(g);
    box(g, 0.44, 0.05, 0.42, 0, 0.25, 0, color, { r: 0.02 });
    box(g, 0.42, 0.34, 0.05, 0, 0.3, -0.2, color, { r: 0.02, rx: -0.08 });
    for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]])
      box(g, 0.035, 0.25, 0.035, lx, 0, lz, '#5E6670', { r: 0.01 });
    return g;
  }
  function seat(id, x, z, h, y, kind, extra = {}) {
    seats.push({ id, x, z, h, y, kind, ...extra });
  }
  function laptopProp(parent, x, y, z, ry, seed) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    parent.add(g);
    box(g, 0.34, 0.018, 0.24, 0, 0, 0, '#B8BEC6', { r: 0.008 });
    const scr = new THREE.Group();
    scr.position.set(0, 0.018, -0.12);
    scr.rotation.x = -0.28;
    g.add(scr);
    box(scr, 0.34, 0.23, 0.012, 0, 0, 0, '#B8BEC6', { r: 0.005 });
    const p = plane(scr, 0.31, 0.2, glowMat(codeScreenTexture(seed, 192, 128)), 0, 0.115, 0.0075);
    p.castShadow = false;
    return g;
  }
  function mug(parent, x, y, z, color) {
    cyl(parent, 0.045, 0.04, 0.1, x, y, z, color, { seg: 14 });
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 12), mat(color));
    h.position.set(x + 0.05, y + 0.05, z);
    parent.add(h);
  }
  function papers(parent, x, y, z) {
    for (let i = 0; i < 3; i++)
      box(parent, 0.21, 0.004, 0.29, x + (R() - 0.5) * 0.05, y + i * 0.004, z + (R() - 0.5) * 0.05, '#FBFBF8', {
        r: 0,
        ry: (R() - 0.5) * 0.6,
        cast: false,
      });
  }
  function plant(x, z, s, potColor = '#C46A4A') {
    cyl(stat, 0.16 * s, 0.12 * s, 0.26 * s, x, 0, z, potColor);
    cyl(stat, 0.15 * s, 0.15 * s, 0.02, x, 0.25 * s, z, '#5A4030', { cast: false });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + R();
      const r = 0.12 * s * R();
      ball(stat, 0.13 * s, x + Math.cos(a) * r, 0.36 * s + R() * 0.45 * s, z + Math.sin(a) * r, i % 2 ? '#4E9A5B' : '#62B46E', {
        s: [1, 1.35, 1],
      });
    }
  }

  // ---- 책장 (북서쪽) ----
  {
    const x0 = 0.3;
    const x1 = 2.3;
    const cx = (x0 + x1) / 2;
    const dz = 0.45;
    const cz = 0.27;
    box(stat, 2.0, 1.9, 0.03, cx, 0, 0.06, '#8C6B50', { r: 0.005 });
    box(stat, 0.05, 1.9, dz, x0 + 0.025, 0, cz, '#A47E5E', { r: 0.01 });
    box(stat, 0.05, 1.9, dz, x1 - 0.025, 0, cz, '#A47E5E', { r: 0.01 });
    const shelfY = [0.02, 0.47, 0.92, 1.37, 1.865];
    for (const y of shelfY) box(stat, 1.98, 0.035, dz, cx, y, cz, '#B48C69', { r: 0.008 });
    const bookColors = ['#E5484D', '#3D6FD8', '#3FA66B', '#FFD15C', '#8E6CCF', '#FF8A3D', '#2F3A36', '#F3E3C3', '#7FD8BE', '#A0522D', '#28366B', '#F6A6C1'];
    const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 200);
    books.castShadow = true;
    books.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let n = 0;
    for (let s = 0; s < 4; s++) {
      let x = x0 + 0.08;
      const y = shelfY[s] + 0.035;
      while (x < x1 - 0.12 && n < 200) {
        if (s === 3 && x > 1.4) break; // 맨 위 칸 오른쪽은 보드게임
        const bw = 0.035 + R() * 0.04;
        const bh = 0.24 + R() * 0.12;
        const tilt = R() < 0.06 ? 0.25 : 0;
        q.setFromEuler(new THREE.Euler(0, 0, tilt));
        m4.compose(new THREE.Vector3(x + bw / 2, y + bh / 2, cz + 0.02), q, new THREE.Vector3(bw, bh, 0.28 + R() * 0.06));
        books.setMatrixAt(n, m4);
        books.setColorAt(n, c.set(bookColors[Math.floor(R() * bookColors.length)]));
        n++;
        x += bw + 0.004 + (tilt ? 0.06 : 0);
      }
    }
    books.count = n;
    stat.add(books);
    // 보드게임 상자
    const games = ['#E5484D', '#FFD15C', '#3D6FD8', '#3FA66B'];
    games.forEach((gc, i) => box(stat, 0.5 - i * 0.04, 0.07, 0.34, 1.85, 1.41 + i * 0.07, cz, gc, { r: 0.01, ry: (R() - 0.5) * 0.2 }));
    // 책장 위 상자
    box(stat, 0.45, 0.22, 0.32, 1.95, 1.9, cz, '#C8A27A', { r: 0.01 });
    col(0.3, 0, 2.3, 0.52);
    spots.push({ id: 'shelf', kind: 'shelf', x: 1.3, z: 0.95, r: 1.25, label: '책 꺼내기' });
  }
  plant(2.65, 0.35, 0.9);
  col(2.45, 0.15, 2.85, 0.55);

  // ---- 창가 작업대 ----
  {
    box(stat, 5.4, 0.05, 0.7, 5.7, 0.53, 0.4, '#E9DCC6', { r: 0.015 });
    for (const lx of [3.08, 8.32]) for (const lz of [0.1, 0.7]) box(stat, 0.05, 0.53, 0.05, lx, 0, lz, '#9AA0A6', { r: 0.01 });
    box(stat, 5.3, 0.3, 0.02, 5.7, 0.2, 0.1, '#D9CDB6', { r: 0.005 });
    const pcs = [3.7, 5.0];
    pcs.forEach((px, i) => {
      box(stat, 0.2, 0.02, 0.14, px, 0.58, 0.24, '#2F3237', { r: 0.008 });
      box(stat, 0.04, 0.14, 0.04, px, 0.6, 0.22, '#2F3237', { r: 0.008 });
      box(stat, 0.66, 0.4, 0.035, px, 0.7, 0.24, '#2F3237', { r: 0.012 });
      const scr = plane(stat, 0.61, 0.35, glowMat(codeScreenTexture(30 + i, 256, 150)), px, 0.9, 0.259);
      scr.castShadow = false;
      box(stat, 0.42, 0.02, 0.13, px, 0.58, 0.56, '#E8E8EA', { r: 0.008 });
      box(stat, 0.05, 0.02, 0.08, px + 0.32, 0.58, 0.56, '#E8E8EA', { r: 0.01 });
      box(stat, 0.2, 0.45, 0.45, px + 0.42, 0, 0.36, '#2F3237', { r: 0.015 });
    });
    // 나머지 자리: 스탠드, 책 더미, 선인장
    cyl(stat, 0.07, 0.08, 0.02, 6.95, 0.58, 0.25, '#FF8A3D');
    box(stat, 0.025, 0.3, 0.025, 6.95, 0.6, 0.25, '#FF8A3D', { r: 0.008, rz: 0.2 });
    cyl(stat, 0.03, 0.08, 0.08, 6.92, 0.86, 0.25, '#FF8A3D', { rz: -0.5 });
    for (let i = 0; i < 4; i++) box(stat, 0.24, 0.035, 0.32, 6.0, 0.58 + i * 0.035, 0.38, ['#3D6FD8', '#E5484D', '#F3E3C3', '#3FA66B'][i], { r: 0.005, ry: (R() - 0.5) * 0.3 });
    cyl(stat, 0.06, 0.05, 0.08, 8.15, 0.58, 0.3, '#C46A4A');
    ball(stat, 0.05, 8.15, 0.71, 0.3, '#4E9A5B', { s: [1, 1.6, 1] });
    mug(stat, 7.1, 0.58, 0.55, '#FFD15C');
    col(3.0, 0, 8.4, 0.76);
    [3.7, 5.0, 6.4, 7.7].forEach((cx, i) => {
      chair(cx, 1.15, PI, CHAIR_COLORS[(i + 1) % CHAIR_COLORS.length]);
      seat(`desk${i + 1}`, cx, 1.15, PI, 0.3, 'chair', { tableY: 0.58, lapZ: 0.62, pc: i < 2 });
    });
  }

  // ---- 탕비 코너: 조리대와 냉장고 ----
  {
    box(stat, 2.2, 0.56, 0.6, 13.5, 0, 0.35, '#F4F1EA', { r: 0.015 });
    box(stat, 2.24, 0.04, 0.64, 13.5, 0.55, 0.35, '#D8D2C6', { r: 0.01 });
    for (const dx of [12.95, 14.05]) box(stat, 0.008, 0.46, 0.01, dx, 0.05, 0.655, '#C9C2B4', { r: 0, cast: false });
    for (const dx of [12.75, 13.15, 13.85, 14.25]) box(stat, 0.12, 0.02, 0.02, dx, 0.45, 0.66, '#9AA0A6', { r: 0.005 });
    // 전자레인지
    box(stat, 0.5, 0.28, 0.34, 12.8, 0.59, 0.3, '#D9DBDE', { r: 0.02 });
    box(stat, 0.3, 0.18, 0.01, 12.73, 0.64, 0.475, '#2B2F35', { r: 0.005, cast: false });
    box(stat, 0.08, 0.05, 0.01, 12.98, 0.78, 0.475, '#7FD8BE', { r: 0.005, cast: false });
    // 커피포트, 커피머신, 컵, 컵라면, 간식 바구니
    cyl(stat, 0.075, 0.085, 0.2, 13.3, 0.59, 0.32, '#F7F7F5');
    cyl(stat, 0.09, 0.09, 0.02, 13.3, 0.59, 0.32, '#3A3D42');
    box(stat, 0.22, 0.3, 0.26, 13.72, 0.59, 0.3, '#2F3237', { r: 0.02 });
    box(stat, 0.1, 0.04, 0.06, 13.72, 0.7, 0.45, '#9AA0A6', { r: 0.01 });
    for (let i = 0; i < 5; i++) cyl(stat, 0.035, 0.028, 0.025, 14.05, 0.59 + i * 0.022, 0.42, '#FFFFFF', { seg: 12 });
    cyl(stat, 0.06, 0.05, 0.09, 14.06, 0.59, 0.22, '#E5484D', { seg: 12 });
    box(stat, 0.32, 0.1, 0.24, 14.36, 0.59, 0.33, '#C8A27A', { r: 0.02 });
    for (let i = 0; i < 5; i++) box(stat, 0.07, 0.1, 0.03, 14.24 + i * 0.06, 0.66, 0.33 + (R() - 0.5) * 0.1, ['#FFD15C', '#E5484D', '#3D6FD8', '#FF8A3D', '#3FA66B'][i], { r: 0.008, rz: (R() - 0.5) * 0.4 });
    col(12.4, 0, 14.6, 0.66);
    spots.push({ id: 'coffee', kind: 'coffee', x: 13.7, z: 1.15, r: 1.0, label: '커피 타기' });
  }
  // 냉장고 (문이 열린다)
  const fridge = { open: false, angle: 0 };
  {
    box(stat, 1.08, 1.45, 0.72, 15.36, 0, 0.42, '#E9ECEE', { r: 0.03 });
    const inside = plane(stat, 0.98, 1.36, glowMat(canvasTex(256, 360, drawFridgeInside)), 15.36, 0.73, 0.783);
    inside.castShadow = false;
    const pivot = new THREE.Group();
    pivot.position.set(15.89, 0.01, 0.815);
    pivot.userData.keep = true;
    root.add(pivot);
    const door = box(pivot, 1.07, 1.42, 0.06, -0.535, 0.01, 0, '#F2F4F5', { r: 0.02 });
    door.userData.keep = true;
    box(pivot, 1.0, 0.012, 0.01, -0.535, 1.0, 0.033, '#C9CFD4', { r: 0, cast: false });
    box(pivot, 0.035, 0.36, 0.04, -0.98, 0.55, 0.05, '#B8BEC6', { r: 0.01 });
    box(pivot, 0.035, 0.2, 0.04, -0.98, 1.1, 0.05, '#B8BEC6', { r: 0.01 });
    ['#E5484D', '#FFD15C', '#3D6FD8'].forEach((c, i) => {
      const mg = cyl(pivot, 0.035, 0.035, 0.015, -0.35 - i * 0.12, 1.15 + (i % 2) * 0.08, 0.035, c, { rx: PI / 2, seg: 12 });
      mg.castShadow = false;
    });
    const memoTex = canvasTex(160, 160, (g, w, h) => drawSign(g, w, h, ['우유', '사 오기!'], '#FFC2D4'));
    plane(pivot, 0.16, 0.16, texMat(memoTex), -0.6, 0.85, 0.032);
    fridge.pivot = pivot;
    const light = new THREE.PointLight('#EAF6FF', 0, 1.6, 2);
    light.position.set(15.36, 0.8, 1.0);
    root.add(light);
    fridge.light = light;
    col(14.8, 0, 15.96, 0.86);
    spots.push({ id: 'fridge', kind: 'fridge', x: 15.3, z: 1.4, r: 1.25, label: '냉장고 열기' });
  }

  // ---- 큰 테이블 (책상 두 개를 붙였다) ----
  {
    for (const tx of [5.1, 8.1]) {
      box(stat, 2.99, 0.05, 2.0, tx, 0.53, 5.2, '#D9B98F', { r: 0.015 });
      for (const lx of [-1.35, 1.35]) for (const lz of [-0.85, 0.85]) box(stat, 0.07, 0.53, 0.07, tx + lx, 0, 5.2 + lz, '#7A6450', { r: 0.01 });
    }
    // 멀티탭, 노트북, 머그, 종이, 피자 박스, 에너지 드링크
    box(stat, 0.5, 0.04, 0.09, 6.6, 0.58, 5.2, '#F7F7F5', { r: 0.015 });
    for (let i = 0; i < 4; i++) box(stat, 0.05, 0.03, 0.03, 6.43 + i * 0.11, 0.6, 5.2, '#3A3D42', { r: 0.005, cast: false });
    laptopProp(stat, 5.6, 0.58, 4.55, PI, 41);
    laptopProp(stat, 7.6, 0.58, 5.85, 0, 42);
    laptopProp(stat, 9.1, 0.58, 4.65, PI + 0.3, 43);
    mug(stat, 4.15, 0.58, 4.6, '#3D6FD8');
    mug(stat, 7.1, 0.58, 5.55, '#F7F5F0');
    papers(stat, 7.4, 0.58, 4.6);
    papers(stat, 5.6, 0.58, 5.7);
    box(stat, 0.5, 0.05, 0.5, 7.9, 0.58, 5.05, '#C9A06A', { r: 0.01, ry: 0.2 });
    box(stat, 0.5, 0.01, 0.5, 7.9, 0.63, 5.05, '#B98B55', { r: 0, ry: 0.2, cast: false });
    cyl(stat, 0.033, 0.033, 0.13, 4.0, 0.58, 5.6, '#3D6FD8', { seg: 12 });
    cyl(stat, 0.033, 0.033, 0.13, 9.2, 0.58, 5.85, '#E5484D', { seg: 12 });
    box(stat, 0.24, 0.05, 0.32, 5.2, 0.58, 5.2, '#28366B', { r: 0.01, ry: -0.3 });
    col(3.6, 4.2, 9.6, 6.2);
    let ci = 0;
    for (const [id, x, z, h] of [
      ['t1', 4.6, 3.8, 0], ['t2', 6.6, 3.8, 0], ['t3', 8.6, 3.8, 0],
      ['t4', 4.6, 6.6, PI], ['t5', 6.6, 6.6, PI], ['t6', 8.6, 6.6, PI],
      ['t7', 3.2, 5.2, PI / 2], ['t8', 10.0, 5.2, -PI / 2],
    ]) {
      chair(x, z, h, CHAIR_COLORS[ci++ % CHAIR_COLORS.length]);
      seat(id, x, z, h, 0.3, 'chair', { tableY: 0.58, lapZ: 0.62 });
    }
  }

  // ---- 스터디 테이블 두 개 ----
  [[4.6, 'A'], [7.8, 'B']].forEach(([tx, name], ti) => {
    box(stat, 2.0, 0.05, 1.2, tx, 0.53, 9.4, '#C9D6DF', { r: 0.015 });
    box(stat, 2.0, 0.015, 1.2, tx, 0.515, 9.4, '#7A8A96', { r: 0.005, cast: false });
    for (const lx of [-0.9, 0.9]) for (const lz of [-0.5, 0.5]) box(stat, 0.05, 0.52, 0.05, tx + lx, 0, 9.4 + lz, '#9AA0A6', { r: 0.01 });
    papers(stat, tx, 0.58, 9.4);
    for (let i = 0; i < 3; i++) box(stat, 0.2, 0.04, 0.28, tx + 0.82, 0.58 + i * 0.04, 9.4, ['#E5484D', '#FFD15C', '#3D6FD8'][(i + ti) % 3], { r: 0.005, ry: (R() - 0.5) * 0.4 });
    mug(stat, tx - 0.86, 0.58, 9.4, ti ? '#FF8A3D' : '#3D6FD8');
    col(tx - 1.0, 8.8, tx + 1.0, 10.0);
    [[-0.5, 8.4, 0], [0.5, 8.4, 0], [-0.5, 10.4, PI], [0.5, 10.4, PI]].forEach(([dx, z, h], i) => {
      chair(tx + dx, z, h, CHAIR_COLORS[(i + ti * 2) % CHAIR_COLORS.length]);
      seat(`s${name}${i + 1}`, tx + dx, z, h, 0.3, 'chair', { tableY: 0.58, lapZ: 0.62 });
    });
  });

  // ---- 소파 존: 러그, 소파, 커피 테이블, TV, 빈백 ----
  {
    const rugTex = canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#E7C873';
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 40);
      g.fill();
      g.strokeStyle = '#F7E7B5';
      g.lineWidth = 14;
      g.beginPath();
      g.roundRect(34, 34, w - 68, h - 68, 26);
      g.stroke();
      g.fillStyle = 'rgba(200,120,60,.35)';
      for (let i = 0; i < 6; i++) g.fillRect(70, 80 + i * 62, w - 140, 14);
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 4.4), new THREE.MeshStandardMaterial({ map: rugTex, transparent: true, roughness: 1 }));
    rug.rotation.x = -PI / 2;
    rug.position.set(13.15, 0.004, 5.2);
    rug.receiveShadow = true;
    rug.userData.keep = true;
    root.add(rug);

    const sc = '#3F7F86';
    box(stat, 0.9, 0.26, 2.4, 11.65, 0.04, 5.0, sc, { r: 0.06 });
    for (const lz of [3.9, 6.1]) for (const lx of [11.3, 12.0]) cyl(stat, 0.03, 0.025, 0.05, lx, 0, lz, '#3A2E26', { seg: 8 });
    for (const z of [4.22, 5.0, 5.78]) box(stat, 0.66, 0.12, 0.76, 11.78, 0.29, z, '#4C9198', { r: 0.05 });
    box(stat, 0.24, 0.52, 2.4, 11.32, 0.27, 5.0, sc, { r: 0.07 });
    for (const z of [4.22, 5.0, 5.78]) box(stat, 0.16, 0.36, 0.72, 11.5, 0.4, z, '#4C9198', { r: 0.06, rz: 0.12 });
    for (const z of [3.92, 6.08]) box(stat, 0.9, 0.42, 0.2, 11.65, 0.04, z, sc, { r: 0.07 });
    box(stat, 0.12, 0.3, 0.3, 11.6, 0.42, 4.15, '#FFD15C', { r: 0.05, rz: 0.25, ry: 0.3 });
    box(stat, 0.12, 0.3, 0.3, 11.6, 0.42, 5.85, '#E07A5F', { r: 0.05, rz: 0.25, ry: -0.2 });
    col(11.2, 3.8, 12.1, 6.2);
    [4.3, 5.0, 5.7].forEach((z, i) => seat(`sofa${i + 1}`, 11.84, z, PI / 2, 0.41, 'sofa', { tableY: null }));

    // 커피 테이블 + 게임 패드 + 과자
    box(stat, 1.1, 0.05, 1.4, 13.35, 0.29, 5.0, '#B98D63', { r: 0.02 });
    for (const lx of [-0.45, 0.45]) for (const lz of [-0.6, 0.6]) box(stat, 0.05, 0.29, 0.05, 13.35 + lx, 0, 5.0 + lz, '#8C6B50', { r: 0.01 });
    for (const [px, pz, c] of [[13.2, 4.7, '#E5484D'], [13.45, 5.25, '#3D6FD8']]) {
      box(stat, 0.16, 0.035, 0.08, px, 0.34, pz, c, { r: 0.02, ry: 0.4 });
    }
    cyl(stat, 0.12, 0.09, 0.07, 13.5, 0.34, 4.65, '#F7F5F0');
    for (let i = 0; i < 6; i++) ball(stat, 0.025, 13.5 + (R() - 0.5) * 0.12, 0.42, 4.65 + (R() - 0.5) * 0.12, '#F2C14E', { cast: false, seg: 8, seg2: 6 });
    mug(stat, 13.1, 0.34, 5.45, '#81B29A');
    col(12.8, 4.3, 13.9, 5.7);

    // TV 장, TV, 게임기
    box(stat, 0.5, 0.4, 2.2, 15.7, 0, 5.0, '#3B3F46', { r: 0.02 });
    for (const z of [4.3, 5.0, 5.7]) box(stat, 0.01, 0.25, 0.6, 15.445, 0.08, z, '#2B2E33', { r: 0, cast: false });
    box(stat, 0.25, 0.04, 0.5, 15.76, 0.4, 5.0, '#2B2E33', { r: 0.01 });
    box(stat, 0.05, 0.1, 0.1, 15.76, 0.44, 5.0, '#2B2E33', { r: 0.01 });
    box(stat, 0.06, 0.98, 1.72, 15.74, 0.52, 5.0, '#1E2024', { r: 0.02 });
    box(stat, 0.2, 0.08, 0.32, 15.62, 0.4, 4.3, '#F3F4F2', { r: 0.02 });
    box(stat, 0.1, 0.06, 0.8, 15.52, 0.4, 5.0, '#2B2E33', { r: 0.02 });
    col(15.45, 3.9, 16, 6.1);

    // 빈백
    const bean = (id, x, z, color) => {
      const toTV = Math.atan2(15.7 - x, 5.0 - z);
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = toTV;
      stat.add(g);
      ball(g, 0.5, 0, 0.24, 0.05, color, { s: [0.95, 0.5, 1.0] });
      ball(g, 0.38, 0, 0.4, -0.25, color, { s: [1.0, 0.75, 0.6] });
      col(x - 0.32, z - 0.32, x + 0.32, z + 0.32);
      seat(id, x, z, toTV, 0.32, 'bean', { tableY: null });
    };
    bean('bean1', 14.35, 3.2, '#F08A6B');
    bean('bean2', 14.35, 6.85, '#A99BE0');
  }
  const tvTex = canvasTex(192, 108, (g, w, h) => drawTV(g, w, h, 0, false), { pixel: true });
  const tvScreen = plane(root, 1.64, 0.9, glowMat(tvTex), 15.705, 1.01, 5.0, -PI / 2);
  tvScreen.castShadow = false;
  const tv = { on: false, acc: 0, tex: tvTex };
  spots.push({ id: 'tv', kind: 'tv', x: 14.75, z: 5.0, r: 1.3, label: 'TV 켜기' });

  // ---- 현관: 사물함, 옷걸이, 신발장, 매트 ----
  {
    box(stat, 0.45, 1.8, 1.9, 15.73, 0, 8.75, '#8EA3B5', { r: 0.02 });
    for (const z of [8.12, 8.75, 9.38]) {
      for (const y of [0.05, 0.92]) {
        box(stat, 0.01, 0.82, 0.6, 15.5, y, z, '#8197A9', { r: 0, cast: false });
        box(stat, 0.03, 0.12, 0.03, 15.49, y + 0.4, z + 0.22, '#D9DCE0', { r: 0.005, cast: false });
        for (let v = 0; v < 3; v++) box(stat, 0.01, 0.012, 0.3, 15.49, y + 0.62 + v * 0.04, z, '#6E8293', { r: 0, cast: false });
      }
    }
    const stickerTex = canvasTex(128, 128, (g, w, h) => drawMark(g, w / 2, h / 2, w / 2 - 4));
    const st = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), texMat(stickerTex));
    st.position.set(15.488, 1.4, 8.75);
    st.rotation.y = -PI / 2;
    stat.add(st);
    col(15.5, 7.8, 16, 9.7);

    // 옷걸이 + 과잠
    cyl(stat, 0.18, 0.2, 0.04, 15.42, 0, 10.0, '#3A3D42');
    cyl(stat, 0.025, 0.025, 1.65, 15.42, 0.04, 10.0, '#3A3D42', { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      ball(stat, 0.03, 15.42 + Math.cos(a) * 0.1, 1.62, 10.0 + Math.sin(a) * 0.1, '#3A3D42', { seg: 8, seg2: 6 });
    }
    box(stat, 0.36, 0.62, 0.18, 15.42, 0.95, 9.88, '#28366B', { r: 0.06, ry: 0.4 });
    box(stat, 0.12, 0.5, 0.12, 15.25, 1.0, 9.8, '#F3E9D2', { r: 0.04, ry: 0.4, rz: 0.12 });
    col(15.22, 9.8, 15.62, 10.2);

    // 신발장 + 삼선 슬리퍼
    box(stat, 2.0, 0.6, 0.4, 14.3, 0, 11.78, '#B48C69', { r: 0.015 });
    for (const y of [0.2, 0.4]) box(stat, 1.94, 0.02, 0.36, 14.3, y, 11.76, '#8C6B50', { r: 0.004, cast: false });
    const shoeColors = ['#F7F5F0', '#2F3237', '#E5484D', '#3D6FD8', '#8A5A3C', '#FFD15C'];
    for (let i = 0; i < 6; i++) {
      const sx = 13.5 + i * 0.3;
      const sy = i % 2 ? 0.42 : 0.22;
      const c = shoeColors[Math.floor(R() * shoeColors.length)];
      box(stat, 0.09, 0.07, 0.24, sx - 0.05, sy, 11.74, c, { r: 0.03, cast: false });
      box(stat, 0.09, 0.07, 0.24, sx + 0.06, sy, 11.74, c, { r: 0.03, cast: false });
    }
    for (const sx of [12.85, 13.02]) {
      box(stat, 0.12, 0.03, 0.27, sx, 0, 11.68, '#2F3A36', { r: 0.012, cast: false });
      box(stat, 0.125, 0.045, 0.1, sx, 0.02, 11.62, '#2E5AAC', { r: 0.012, cast: false });
      for (const o of [-0.03, 0, 0.03]) box(stat, 0.008, 0.002, 0.1, sx + o, 0.066, 11.62, '#FFFFFF', { r: 0, cast: false });
    }
    col(13.3, 11.55, 15.3, 12);
    box(stat, 0.8, 0.015, 1.1, 15.45, 0, 10.8, '#7A6A5A', { r: 0.005, cast: false });
    spots.push({ id: 'door', kind: 'door', x: 15.25, z: 10.8, r: 1.15, label: '나가기' });
  }

  // ---- 서쪽 벽 쪽: 프린터, 쓰레기통, 에어컨, 화분 ----
  {
    box(stat, 0.55, 0.6, 1.0, 0.33, 0, 5.7, '#E8E4DC', { r: 0.015 });
    box(stat, 0.44, 0.24, 0.5, 0.33, 0.6, 5.7, '#ECEDEF', { r: 0.03 });
    box(stat, 0.02, 0.03, 0.34, 0.56, 0.72, 5.7, '#3A3D42', { r: 0.005, cast: false });
    box(stat, 0.3, 0.06, 0.24, 0.33, 0.6, 6.05, '#FBFBF8', { r: 0.005 });
    col(0, 5.2, 0.61, 6.2);
    cyl(stat, 0.17, 0.15, 0.42, 0.3, 0, 6.65, '#5E8C6A');
    cyl(stat, 0.17, 0.15, 0.42, 0.3, 0, 7.08, '#4F7CAC');
    col(0, 6.45, 0.5, 7.28);
    box(stat, 0.48, 1.75, 0.5, 0.36, 0, 11.6, '#F3F4F2', { r: 0.06 });
    for (let i = 0; i < 6; i++) box(stat, 0.01, 0.015, 0.38, 0.605, 1.15 + i * 0.06, 11.6, '#C9CDD1', { r: 0, cast: false });
    box(stat, 0.01, 0.06, 0.12, 0.605, 0.95, 11.6, '#7FD8BE', { r: 0, cast: false });
    col(0.1, 11.33, 0.62, 11.88);
    plant(1.15, 11.55, 1.6);
    col(0.88, 11.28, 1.42, 11.84);
    // 남쪽 낮은 공용 수납장
    box(stat, 3.4, 0.62, 0.4, 4.3, 0, 11.78, '#E3D5C0', { r: 0.015 });
    for (let i = 0; i < 5; i++) {
      box(stat, 0.6, 0.24, 0.02, 2.9 + i * 0.7, 0.07, 11.575, '#CDBDA4', { r: 0.004, cast: false });
      box(stat, 0.6, 0.24, 0.02, 2.9 + i * 0.7, 0.34, 11.575, '#CDBDA4', { r: 0.004, cast: false });
    }
    box(stat, 0.42, 0.3, 0.3, 3.0, 0.62, 11.75, '#C8A27A', { r: 0.01 });
    box(stat, 0.34, 0.06, 0.26, 4.0, 0.62, 11.76, '#E5484D', { r: 0.01, ry: 0.1 });
    ball(stat, 0.12, 5.4, 0.74, 11.75, '#F7F5F0');
    col(2.6, 11.58, 6.0, 12);
  }

  // 정적 메쉬 합치기
  mergeGroup(stat);
  for (const w of walls) {
    mergeGroup(w.body);
    mergeGroup(w.decor);
  }

  // ---- 구역 ----
  const zones = [
    { id: 'desk', name: '창가 작업대', x0: 2.6, z0: 0, x1: 8.8, z1: 2.4, desc: '창밖을 보며 혼자 파고드는 자리. 데스크탑 두 대는 먼저 앉는 사람 거예요.' },
    { id: 'board', name: '화이트보드', x0: 8.8, z0: 0, x1: 12.2, z1: 2.4, desc: '알고리즘 풀이부터 회의 안건, 낙서까지. 앞에서 F를 누르면 다 같이 그려요.' },
    { id: 'pantry', name: '탕비 코너', x0: 12.2, z0: 0, x1: 16, z1: 2.4, desc: '냉장고, 전자레인지, 커피포트. 간식은 채워 넣는 사람이 승자예요.' },
    { id: 'shelf', name: '책장', x0: 0, z0: 0, x1: 2.6, z1: 2.4, desc: '기술 책과 보드게임이 빼곡해요.' },
    { id: 'table', name: '큰 테이블', x0: 2.4, z0: 2.4, x1: 10.7, z1: 7.5, desc: '노트북 펴고 다 같이 앉는 큰 테이블. 각자 하다 막히면 옆 사람한테 물어봐요.' },
    { id: 'sofa', name: '소파 존', x0: 10.7, z0: 2.4, x1: 16, z1: 7.6, desc: '과제하다 지치면 쉬어 가는 소파와 빈백. TV에 게임기도 연결돼 있어요.' },
    { id: 'study', name: '스터디 테이블', x0: 2.4, z0: 7.5, x1: 10.7, z1: 12, desc: '작게 모여 스터디하거나 팀플 하는 4인 테이블 두 개.' },
    { id: 'entry', name: '현관', x0: 10.7, z0: 7.6, x1: 16, z1: 12, desc: '신발 벗고 들어와요. 사물함과 옷걸이는 문 옆에 있어요.' },
    { id: 'west', name: '게시판 벽', x0: 0, z0: 2.4, x1: 2.4, z1: 12, desc: '사진과 메모가 붙은 코르크 게시판.' },
  ];

  // ---- 매 프레임 ----
  let clockAcc = 1;
  let skyHour = new Date().getHours();
  function update(dt, t) {
    for (const w of walls) {
      w.cut = damp(w.cut, w.target, 9, dt);
      w.body.scale.y = 1 - 0.95 * w.cut;
      w.decor.visible = w.cut < 0.45;
    }
    fridge.angle = damp(fridge.angle, fridge.open ? 1.8 : 0, 7, dt);
    fridge.pivot.rotation.y = fridge.angle;
    fridge.light.intensity = (fridge.angle / 1.8) * 2.2;
    if (tv.on) {
      tv.acc += dt;
      if (tv.acc > 1 / 12) {
        tv.acc = 0;
        const c = tv.tex.userData.canvas;
        drawTV(tv.tex.userData.ctx, c.width, c.height, t, true);
        tv.tex.needsUpdate = true;
      }
    }
    clockAcc += dt;
    if (clockAcc > 0.5) {
      clockAcc = 0;
      const now = new Date();
      const s = now.getSeconds();
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      secHand.rotation.z = -(s / 60) * PI * 2;
      minHand.rotation.z = -(m / 60) * PI * 2;
      hourHand.rotation.z = -(h / 12) * PI * 2;
      if (now.getHours() !== skyHour) {
        skyHour = now.getHours();
        const c = skyTex.userData.canvas;
        drawSky(skyTex.userData.ctx, c.width, c.height, skyHour);
        skyTex.needsUpdate = true;
      }
    }
  }

  // 카메라 쪽을 향한 벽은 잘라서 안이 보이게
  function setCut(dirX, dirZ, enabled) {
    for (const w of walls) {
      const d = w.inner.x * dirX + w.inner.z * dirZ;
      w.target = enabled && d < -0.25 ? 1 : 0;
    }
  }

  function toggleFridge() {
    fridge.open = !fridge.open;
    spots.find((s) => s.id === 'fridge').label = fridge.open ? '냉장고 닫기' : '냉장고 열기';
    return fridge.open;
  }
  function toggleTV() {
    tv.on = !tv.on;
    if (!tv.on) {
      const c = tv.tex.userData.canvas;
      drawTV(tv.tex.userData.ctx, c.width, c.height, 0, false);
      tv.tex.needsUpdate = true;
    }
    spots.find((s) => s.id === 'tv').label = tv.on ? 'TV 끄기' : 'TV 켜기';
    return tv.on;
  }

  return {
    root,
    W,
    D,
    colliders,
    seats,
    spots,
    zones,
    walls,
    boardSurface,
    spawn: { x: 14.4, z: 10.8, h: -PI / 2 },
    update,
    setCut,
    toggleFridge,
    toggleTV,
  };
}

// 다른 맵(카페 등)이 같은 가구 도우미와 텍스처를 쓰도록 내보낸다
export { mat, rgeo, box, cyl, ball, plane, texMat, glowMat, mergeGroup, drawSky, drawSign, drawPoster, drawGroupPhoto, drawClockFace };
