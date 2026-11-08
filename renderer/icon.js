// 앱 아이콘과 DMG 배경 그리기: 앱에서 쓰는 3D 캐릭터와 가구를 그대로 렌더링한다.
// ?v=desk | wave | room → 1024px 아이콘, ?v=dmgbg&s=1|2 → DMG 창 배경
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Avatar } from '/js/avatar.js';
import { normalizeLook } from '/js/config.js';
import { setBrand, OFFICE_BRAND } from '/js/brand.js';

setBrand(OFFICE_BRAND);

const q = new URLSearchParams(location.search);
const V = q.get('v') || 'desk';
const PI = Math.PI;

await Promise.race([
  Promise.all([document.fonts.load('80px "Jua"'), document.fonts.load('30px "Pretendard Variable"')]).catch(() => {}),
  new Promise((r) => setTimeout(r, 3000)),
]);

const GREEN_TOP = '#2F6E5E';
const GREEN_BOT = '#173A33';
const ORANGE = '#FF8A3D';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function dots(g, x, y, w, h, step, rad, color) {
  g.fillStyle = color;
  for (let yy = y + step / 2; yy < y + h; yy += step)
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      g.beginPath();
      g.arc(xx, yy, rad, 0, PI * 2);
      g.fill();
    }
}
// 체크 말풍선 (보고 완료)
function bubble(g, cx, cy, w, h) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = h * 0.3;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.28)';
  g.shadowBlur = w * 0.08;
  g.shadowOffsetY = w * 0.035;
  g.fillStyle = ORANGE;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.lineTo(x + w * 0.36, y + h);
  g.lineTo(x + w * 0.16, y + h * 1.32);
  g.lineTo(x + w * 0.2, y + h);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
  g.restore();
  g.save();
  g.globalAlpha = 0.22;
  g.fillStyle = '#FFFFFF';
  roundRect(g, x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.3, h * 0.15);
  g.fill();
  g.restore();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = h * 0.17;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x + w * 0.3, y + h * 0.53);
  g.lineTo(x + w * 0.45, y + h * 0.7);
  g.lineTo(x + w * 0.72, y + h * 0.32);
  g.stroke();
}

// ---------- 3D ----------
const mats = new Map();
const mat = (c) => {
  if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
  return mats.get(c);
};
function box(parent, w, h, d, x, y, z, color, r = 0.03) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.002)), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function render3D(size) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFF8EE', '#9C8B7A', 1.9));
  scene.add(new THREE.AmbientLight('#FFFFFF', 0.5));
  const sun = new THREE.DirectionalLight('#FFF1DE', 2.3);
  sun.position.set(-3, 7, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const look = normalizeLook({
    skin: '#FFE6D2', hairColor: '#2B2422', cloth: '#28366B', accent: '#FF8A3D',
    hair: 'short', hat: V === 'wave' ? 'none' : 'phones', face: 'smile', glasses: 'none', top: 'jacket', neck: 'none', bag: 'none',
  });
  const av = new Avatar(look);
  av.blinkT = 1e9; // 렌더링할 때 눈 감지 않게
  scene.add(av.root);

  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  let state = { t: 0, moving: 0, air: false, st: 0, seat: null, act: '', emote: '', emoteT: 9 };

  if (V === 'wave') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.16, 64), mat('#E9E1D2'));
    disc.position.y = -0.08;
    disc.receiveShadow = true;
    scene.add(disc);
    av.root.rotation.y = 0.32;
    state = { ...state, emote: 'wave' };
    cam.position.set(1.15, 2.35, 4.1);
    cam.lookAt(0.05, 0.62, 0);
  } else {
    // 책상에서 노트북을 두드리는 캐릭터
    const tile = V === 'room' ? 3.2 : 2.7;
    box(scene, tile, 0.24, tile, 0, -0.24, 0, '#E4DCCD', 0.12);
    if (V === 'room') {
      const wall = (w, d, x, z) => {
        box(scene, w, 1.9, d, x, 0, z, '#F1EDE4', 0.02);
        box(scene, w === 0.14 ? 0.03 : w - 0.02, 0.7, w === 0.14 ? d - 0.02 : 0.03, x + (w === 0.14 ? 0.085 : 0), 0, z + (w === 0.14 ? 0 : 0.085), '#A8C5B2', 0.006);
      };
      wall(3.2, 0.14, 0, -1.67);
      wall(0.14, 3.2, -1.67, 0);
      box(scene, 1.1, 0.72, 0.05, 0.55, 0.95, -1.585, '#FAFAF7', 0.02);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.6), new THREE.MeshBasicMaterial({ color: '#8CCBF2', toneMapped: false }));
      sky.position.set(0.55, 1.31, -1.555);
      scene.add(sky);
      box(scene, 0.03, 0.62, 0.02, 0.55, 1.0, -1.545, '#FAFAF7', 0.005);
      box(scene, 0.62, 0.5, 0.03, -1.585, 0.95, 0.4, '#C9A57B', 0.01).rotation.y = PI / 2;
    }
    const dz = 0.55;
    box(scene, 1.5, 0.06, 0.72, 0, 0.52, dz, '#D9B98F', 0.02);
    for (const lx of [-0.68, 0.68]) for (const lz of [-0.3, 0.3]) box(scene, 0.06, 0.52, 0.06, lx, 0, dz + lz, '#8C6B50', 0.01);
    // 의자
    box(scene, 0.46, 0.05, 0.44, 0, 0.25, -0.02, '#E07A5F', 0.02);
    box(scene, 0.44, 0.36, 0.05, 0, 0.3, -0.24, '#E07A5F', 0.02);
    for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.15]) box(scene, 0.035, 0.25, 0.035, lx, 0, lz - 0.02, '#5E6670', 0.01);
    // 머그, 화분
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.13, 20), mat(ORANGE));
    mug.position.set(0.52, 0.645, dz + 0.12);
    mug.castShadow = true;
    scene.add(mug);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 20), mat('#C46A4A'));
    pot.position.set(-0.56, 0.64, dz - 0.12);
    pot.castShadow = true;
    scene.add(pot);
    for (const [x, y, z, s] of [[-0.56, 0.78, dz - 0.12, 0.09], [-0.5, 0.86, dz - 0.1, 0.07], [-0.62, 0.84, dz - 0.15, 0.07]]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), mat('#4E9A5B'));
      leaf.position.set(x, y, z);
      leaf.castShadow = true;
      scene.add(leaf);
    }
    av.root.position.set(0, 0, -0.02);
    state = { ...state, st: 1, seat: { y: 0.3, tableY: 0.58, lapZ: 0.6, kind: 'chair' }, act: 'laptop' };
    if (V === 'room') {
      cam.position.set(4.6, 4.6, 6.1);
      cam.lookAt(-0.05, 0.55, -0.2);
    } else {
      cam.position.set(2.7, 3.6, 5.6);
      cam.lookAt(0, 0.62, 0.15);
    }
  }
  // 관절을 목표 자세로 충분히 보내 놓고 찍는다
  for (let i = 0; i < 90; i++) {
    state.t = i / 60;
    if (state.emote) state.emoteT = 0.3 + (i / 90) * 0.12;
    av.update(1 / 60, state);
  }
  renderer.render(scene, cam);
  return renderer.domElement;
}

// ---------- 아이콘 ----------
function drawIcon() {
  const S = 1024;
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const g = out.getContext('2d');
  const T = { x: 100, y: 100, w: 824, h: 824, r: 186 };
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  roundRect(g, T.x, T.y, T.w, T.h, T.r);
  const grd = g.createLinearGradient(0, T.y, 0, T.y + T.h);
  grd.addColorStop(0, GREEN_TOP);
  grd.addColorStop(1, GREEN_BOT);
  g.fillStyle = grd;
  g.fill();
  g.restore();
  g.save();
  roundRect(g, T.x, T.y, T.w, T.h, T.r);
  g.clip();
  dots(g, T.x, T.y, T.w, T.h, 44, 3.2, 'rgba(255,255,255,.07)');
  const glow = g.createRadialGradient(512, 600, 60, 512, 600, 520);
  glow.addColorStop(0, 'rgba(255,240,210,.20)');
  glow.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = glow;
  g.fillRect(T.x, T.y, T.w, T.h);
  const scene = render3D(S);
  const shift = V === 'wave' ? { x: -60, y: 40, s: 1.0 } : V === 'room' ? { x: -30, y: 46, s: 1.0 } : { x: -40, y: 52, s: 1.0 };
  g.drawImage(scene, shift.x, shift.y, S * shift.s, S * shift.s);
  const hl = g.createLinearGradient(0, T.y, 0, T.y + 260);
  hl.addColorStop(0, 'rgba(255,255,255,.12)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(T.x, T.y, T.w, 260);
  g.restore();
  if (V === 'wave') bubble(g, 700, 282, 250, 178);
  else if (V === 'room') bubble(g, 712, 268, 236, 168);
  else bubble(g, 716, 278, 250, 178);
  return out;
}

// ---------- DMG 창 배경 ----------
function drawDmgBg(scale) {
  const W = 540 * scale;
  const H = 380 * scale;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = '#FFFCF6';
  g.fillRect(0, 0, 540, 380);
  dots(g, 0, 0, 540, 380, 22, 1.2, 'rgba(34,89,74,.08)');
  // 위쪽 초록 띠
  const band = g.createLinearGradient(0, 0, 0, 96);
  band.addColorStop(0, GREEN_TOP);
  band.addColorStop(1, '#22594A');
  g.fillStyle = band;
  g.fillRect(0, 0, 540, 96);
  dots(g, 0, 0, 540, 96, 22, 1.4, 'rgba(255,255,255,.08)');
  g.fillStyle = '#FFF6E8';
  g.textAlign = 'center';
  g.font = '30px "Jua", sans-serif';
  g.fillText('에이전트 작업실', 270, 50);
  g.font = '600 13px "Pretendard Variable", sans-serif';
  g.fillStyle = 'rgba(255,246,232,.82)';
  g.fillText('Orca · Claude · Codex 에이전트가 끝나면 보고하러 와요', 270, 76);
  // 아이콘 자리
  for (const x of [140, 400]) {
    g.fillStyle = '#F2EBDD';
    roundRect(g, x - 66, 136, 132, 132, 30);
    g.fill();
  }
  // 끌어 놓기 화살표
  g.strokeStyle = ORANGE;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.setLineDash([2, 11]);
  g.beginPath();
  g.moveTo(222, 190);
  g.quadraticCurveTo(270, 160, 314, 190);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = ORANGE;
  g.beginPath();
  g.moveTo(328, 200);
  g.lineTo(306, 198);
  g.lineTo(318, 180);
  g.closePath();
  g.fill();
  g.fillStyle = '#4B5452';
  g.font = '600 13.5px "Pretendard Variable", sans-serif';
  g.fillText('왼쪽 앱을 Applications 폴더로 끌어 놓으세요', 270, 334);
  g.fillStyle = '#9AA0A6';
  g.font = '11px "Pretendard Variable", sans-serif';
  g.fillText('설치한 뒤에는 화면 맨 위 상단바에서 열어요', 270, 356);
  return c;
}

// ---------- 글씨만 있는 앱 아이콘 ----------
function drawTextIcon(text) {
  const S = 1024;
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const g = out.getContext('2d');
  const T = { x: 100, y: 100, w: 824, h: 824, r: 186 };
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  roundRect(g, T.x, T.y, T.w, T.h, T.r);
  const grd = g.createLinearGradient(0, T.y, 0, T.y + T.h);
  grd.addColorStop(0, GREEN_TOP);
  grd.addColorStop(1, GREEN_BOT);
  g.fillStyle = grd;
  g.fill();
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '100px "Jua"';
  const size = Math.min(300, (T.w * 0.72 * 100) / g.measureText(text).width);
  g.font = `${size}px "Jua"`;
  g.fillStyle = '#FFF6E8';
  g.fillText(text, S / 2, S / 2 + size * 0.06);
  return out;
}

// ---------- 상단바 아이콘: 둥근 사각형에 글자 하나 (검정 + 투명 → macOS가 색을 맞춘다) ----------
function drawTray(size, ch) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const pad = size * 0.05;
  g.fillStyle = '#000';
  roundRect(g, pad, pad, size - pad * 2, size - pad * 2, size * 0.26);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(size * 0.66)}px "Jua"`;
  g.fillText(ch, size / 2, size / 2 + size * 0.05);
  g.globalCompositeOperation = 'source-over';
  return c;
}

const canvas =
  V === 'dmgbg'
    ? drawDmgBg(Number(q.get('s')) || 1)
    : V === 'text'
      ? drawTextIcon(q.get('text') || '작업실')
      : V === 'tray'
        ? drawTray(Number(q.get('size')) || 36, q.get('ch') || '작')
        : drawIcon();
window.__png = canvas.toDataURL('image/png');
document.title = 'ready';
