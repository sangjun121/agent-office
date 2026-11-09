// 파리 생제르맹 데프레 맵: 실제 거리 배치를 작게 줄였다 (북쪽이 위, 16 × 12).
//   생제르맹 대로가 가운데를 동서로 지나고, 성당(종탑이 서쪽)과 그 앞 광장,
//   광장 모퉁이 카페, 한 블록 서쪽 카페, 길 건너 브라세리, 렌 거리가 시작되는 퀘벡 광장,
//   성당 북쪽 로랑 프라슈 공원(피카소의 청동 두상), 대로의 메트로 4호선 입구.
// 가게 이름은 실제 가게 대신 지어낸 이름을 쓴다.
import * as THREE from 'three';
import { box, cyl, ball, plane, texMat, glowMat, mergeGroup } from './room.js';
import { canvasTex, rng, FONT_HAND, FONT_BODY } from './tex.js';
import { damp } from './util.js';

const W = 16;
const D = 12;
const PI = Math.PI;
const PX = 64;
const FLOOR_H = 1.05; // 1층(가게) 높이
const BLD_H = 2.75; // 처마 높이
const ROOF_H = 0.5; // 지붕(맨사드) 높이

// ---------- 바닥 그림: 보도, 차도, 광장 돌바닥, 잔디, 횡단보도 ----------
function drawStreets(g, w, h) {
  const L = (u) => u * PX;
  const rect = (x0, z0, x1, z1, c) => {
    g.fillStyle = c;
    g.fillRect(L(x0), L(z0), L(x1 - x0), L(z1 - z0));
  };
  // 보도 (밝은 돌)
  rect(0, 0, W, D, '#D9D2C5');
  g.strokeStyle = 'rgba(120, 108, 92, .16)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 22) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = 0; y < h; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  // 차도
  const ASP = '#5E6167';
  rect(0, 7.0, W, 8.6, ASP); // 생제르맹 대로
  rect(0, 1.25, W, 1.85, ASP); // 자코브 거리, 아베이 거리
  rect(3.95, 1.25, 4.45, 7.0, ASP); // 생브누아 거리
  rect(8.35, 1.25, 9.25, 7.0, ASP); // 보나파르트 거리 (북쪽)
  rect(7.95, 8.6, 8.75, D, ASP); // 보나파르트 거리 (남쪽, 생쉴피스 쪽)
  g.fillStyle = ASP; // 렌 거리: 광장에서 남서쪽으로
  g.beginPath();
  g.moveTo(L(10.35), L(8.6));
  g.lineTo(L(11.55), L(8.6));
  g.lineTo(L(11.15), L(D));
  g.lineTo(L(9.95), L(D));
  g.closePath();
  g.fill();
  // 아스팔트 결
  const R = rng(11);
  g.globalAlpha = 0.08;
  for (let k = 0; k < 2600; k++) {
    g.fillStyle = k % 2 ? '#FFFFFF' : '#000000';
    g.fillRect(R() * w, L(7.0) + R() * L(1.6), 2, 2);
  }
  g.globalAlpha = 1;
  // 대로 가운데 점선, 차선 끝 선
  g.fillStyle = '#F2F2EE';
  for (let x = 0.2; x < W; x += 0.9) g.fillRect(L(x), L(7.78), L(0.5), 3);
  // 횡단보도 (보나파르트, 생브누아)
  for (const [x0, x1] of [[8.2, 9.4], [3.8, 4.6]]) for (let z = 7.12; z < 8.5; z += 0.24) g.fillRect(L(x0), L(z), L(x1 - x0), L(0.12));
  // 광장 돌바닥 (생제르맹 데프레 광장, 퀘벡 광장)
  for (const [x0, z0, x1, z1] of [[9.5, 4.2, 10.9, 5.6], [8.9, 9.6, 10.25, 10.6]]) {
    rect(x0, z0, x1, z1, '#B9B1A4');
    g.strokeStyle = 'rgba(70, 62, 52, .28)';
    for (let y = L(z0); y < L(z1); y += 7)
      for (let x = L(x0) + ((y / 7) % 2 ? 0 : 4); x < L(x1); x += 8) {
        g.strokeRect(x, y, 8, 7);
      }
  }
  // 잔디: 로랑 프라슈 공원, 성당 남쪽 뜰
  rect(9.55, 2.15, 10.85, 4.15, '#6E9E5C');
  rect(12.0, 4.75, 15.5, 5.55, '#77A764');
  rect(9.95, 2.15, 10.25, 4.15, '#CDBFA6'); // 공원 안 자갈길
}

// 오스만 건물 벽: 돌 줄눈, 키 큰 창, 2층 발코니
function drawFacade(g, w, h) {
  g.fillStyle = '#EADFCB';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(150, 128, 98, .25)';
  g.lineWidth = 1;
  for (let y = 12; y < h; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  const floors = 3;
  const fh = h / floors;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < 4; i++) {
      const x = 18 + i * (w / 4);
      const y = f * fh + fh * 0.18;
      const ww = w / 4 - 36;
      const wh = fh * 0.62;
      g.fillStyle = '#F7F1E6';
      g.fillRect(x - 5, y - 5, ww + 10, wh + 10);
      g.fillStyle = '#4A5866';
      g.fillRect(x, y, ww, wh);
      g.fillStyle = 'rgba(255, 255, 255, .18)';
      g.fillRect(x, y, ww / 2 - 2, wh);
      g.fillStyle = '#F7F1E6';
      g.fillRect(x + ww / 2 - 2, y, 4, wh);
      g.fillRect(x, y + wh * 0.35, ww, 3);
      // 창마다 작은 쇠 난간
      g.strokeStyle = '#26292D';
      g.lineWidth = 2;
      g.strokeRect(x - 2, y + wh * 0.72, ww + 4, wh * 0.28);
      for (let k = 1; k < 6; k++) {
        g.beginPath();
        g.moveTo(x + (k * ww) / 6, y + wh * 0.72);
        g.lineTo(x + (k * ww) / 6, y + wh);
        g.stroke();
      }
    }
    // 처마 띠
    g.fillStyle = 'rgba(160, 138, 104, .35)';
    g.fillRect(0, (f + 1) * fh - 4, w, 4);
  }
  // 2층 이어진 발코니
  g.fillStyle = '#26292D';
  g.fillRect(0, fh * 0.93, w, 4);
}
// 1층 가게 앞면: 짙은 나무틀과 유리
function drawShop(color) {
  return (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * (w / 3);
      g.fillStyle = '#E8E2D2';
      g.fillRect(x, h * 0.2, w / 3 - 24, h * 0.7);
      g.fillStyle = 'rgba(255, 220, 160, .55)';
      g.fillRect(x + 4, h * 0.2 + 4, w / 3 - 32, h * 0.7 - 8);
    }
  };
}
function drawAwning(bg, fg, text) {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(h * 0.5)}px ${FONT_BODY}`;
    g.fillText(text, w / 2, h / 2 + 2);
  };
}
function drawPlaque(text) {
  return (g, w, h) => {
    g.fillStyle = '#1E3A6E';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeStyle = '#2E7D4F';
    g.lineWidth = 3;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#FFFFFF';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(h * 0.34)}px ${FONT_BODY}`;
    g.fillText(text, w / 2, h / 2 + 2);
  };
}
function drawMetro(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#F2C230';
  g.beginPath();
  g.arc(w / 2, h / 2, w / 2 - 2, 0, PI * 2);
  g.fill();
  g.fillStyle = '#1C1C1C';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(h * 0.62)}px ${FONT_BODY}`;
  g.fillText('M', w / 2, h / 2 + 4);
}
function drawPosters(g, w, h) {
  const cs = ['#E5484D', '#3D6FD8', '#F2C230', '#2F6E5E', '#C46A4A', '#8E6CCF'];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = cs[i];
    g.fillRect((i * w) / 6, 0, w / 6 - 2, h);
    g.fillStyle = 'rgba(255, 255, 255, .8)';
    g.font = `${Math.round(h * 0.18)}px ${FONT_HAND}`;
    g.textAlign = 'center';
    g.fillText(['JAZZ', 'EXPO', 'CINÉ', 'LIVRES', 'THÉÂTRE', 'ART'][i], (i + 0.5) * (w / 6), h * 0.55);
  }
}

export function buildParis(scene, { boardTexture } = {}) {
  const root = new THREE.Group();
  root.name = 'paris';
  scene.add(root);
  const stat = new THREE.Group();
  root.add(stat);
  const R = rng(1789);
  const colliders = [];
  const seats = [];
  const walls = [];
  const col = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const seat = (id, x, z, h, y, kind, extra = {}) => seats.push({ id, x, z, h, y, kind, ...extra });

  // 받침대와 바닥
  box(stat, W + 0.8, 0.5, D + 0.8, W / 2, -0.51, D / 2, '#4A4F57', { r: 0.1, cast: false });
  const floorTex = canvasTex(W * PX, D * PX, drawStreets);
  floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  floor.rotation.x = -PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- 건물 도우미: 돌벽 상자 + 거리 쪽 벽 그림 + 1층 가게 + 맨사드 지붕 + 굴뚝 ----
  const facadeTex = canvasTex(512, 384, drawFacade);
  facadeTex.wrapS = THREE.RepeatWrapping;
  const facadeMat = (len) => {
    const t = facadeTex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(len / 1.6)), 1);
    return texMat(t, { roughness: 0.85 });
  };
  const shopMats = ['#2F4A3E', '#5A2E2E', '#2B3A55', '#4A3B2A'].map((c) => {
    const t = canvasTex(256, 96, drawShop(c));
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
  // faces: 거리 쪽으로 그림을 붙일 면들 ('n','s','e','w')
  function building(group, decor, x0, z0, x1, z1, faces, shop = 0, h = BLD_H) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const bw = x1 - x0;
    const bd = z1 - z0;
    box(group, bw, h, bd, cx, 0, cz, '#E2D6C0', { r: 0.02 });
    // 맨사드 지붕 (회색 아연) + 지붕창 + 굴뚝
    box(group, bw - 0.16, ROOF_H, bd - 0.16, cx, h, cz, '#6F7D89', { r: 0.06 });
    box(group, bw - 0.5, 0.06, bd - 0.5, cx, h + ROOF_H, cz, '#5E6B76', { r: 0.02 });
    const nDorm = Math.max(1, Math.floor(bw / 0.9));
    for (let i = 0; i < nDorm; i++) {
      const dx = x0 + (i + 0.5) * (bw / nDorm);
      if (faces.includes('s')) box(group, 0.22, 0.26, 0.12, dx, h + 0.1, z1 - 0.1, '#EDE6DA', { r: 0.02 });
      if (faces.includes('n')) box(group, 0.22, 0.26, 0.12, dx, h + 0.1, z0 + 0.1, '#EDE6DA', { r: 0.02 });
    }
    for (let i = 0; i < Math.max(1, Math.floor(bw / 1.8)); i++) {
      const chx = x0 + 0.5 + R() * (bw - 1);
      box(group, 0.22, 0.34, 0.16, chx, h + ROOF_H - 0.05, cz + (R() - 0.5) * bd * 0.4, '#B8735A', { r: 0.02 });
      cyl(group, 0.03, 0.03, 0.1, chx, h + ROOF_H + 0.29, cz, '#9C5E48', { seg: 6, cast: false });
    }
    // 벽 그림과 1층 가게
    const up = h - FLOOR_H;
    const add = (len, x, z, ry) => {
      const m = plane(decor, len, up, facadeMat(len), x, FLOOR_H + up / 2, z, ry);
      m.userData.keep = true;
      const st = shopMats[(shop + faces.length + Math.round(x)) % shopMats.length].clone();
      st.needsUpdate = true;
      st.repeat.set(Math.max(1, Math.round(len / 1.4)), 1);
      const s = plane(decor, len, FLOOR_H - 0.05, texMat(st, { roughness: 0.7 }), x, (FLOOR_H - 0.05) / 2, z, ry);
      s.userData.keep = true;
    };
    if (faces.includes('s')) add(bw, cx, z1 + 0.012, 0);
    if (faces.includes('n')) add(bw, cx, z0 - 0.012, PI);
    if (faces.includes('e')) add(bd, x1 + 0.012, cz, PI / 2);
    if (faces.includes('w')) add(bd, x0 - 0.012, cz, -PI / 2);
  }
  // 차양: 벽에서 바깥으로 기울어진 천막 + 앞 띠의 가게 이름
  function awning(decor, x0, x1, zWall, out, bg, fg, text) {
    const len = x1 - x0;
    const depth = 0.55;
    const a = box(decor, len, 0.04, depth, (x0 + x1) / 2, 0, zWall + (out * depth) / 2, bg, { r: 0.01, cast: true });
    a.position.y = FLOOR_H + 0.02;
    a.rotation.x = out * 0.32;
    const tex = canvasTex(512, 64, drawAwning(bg, fg, text));
    const valance = plane(decor, len, 0.16, texMat(tex, { roughness: 0.8 }), (x0 + x1) / 2, FLOOR_H - 0.17, zWall + out * (depth * 0.95), out > 0 ? 0 : PI);
    valance.userData.keep = true;
  }
  function plaque(decor, text, x, y, z, ry) {
    const t = canvasTex(512, 128, drawPlaque(text));
    plane(decor, 0.62, 0.155, glowMat(t), x, y, z, ry).userData.keep = true;
  }

  // ---- 벽 노릇을 하는 바깥 건물들 (카메라 쪽은 낮아진다) ----
  function wall(name, inner) {
    const g = new THREE.Group();
    root.add(g);
    const body = new THREE.Group();
    const decor = new THREE.Group();
    g.add(body, decor);
    const w = { name, group: g, body, decor, inner, cut: 0, target: 0 };
    walls.push(w);
    return w;
  }
  const north = wall('north', { x: 0, z: 1 });
  const south = wall('south', { x: 0, z: -1 });
  const west = wall('west', { x: 1, z: 0 });
  const east = wall('east', { x: -1, z: 0 });
  // 북쪽 줄 (자코브·아베이 거리 북쪽)
  building(north.body, north.decor, 0, 0, 5.2, 1.0, ['s'], 1, 2.95);
  building(north.body, north.decor, 5.2, 0, 10.6, 1.0, ['s'], 2, 3.05);
  building(north.body, north.decor, 10.6, 0, 16, 1.0, ['s'], 3, 2.9);
  col(0, 0, W, 1.0);
  // 남쪽 줄: 브라세리가 있는 블록, 보나파르트·렌 거리 사이 작은 블록, 렌 거리 동쪽 블록
  building(south.body, south.decor, 0, 9.6, 7.7, D, ['n'], 0, 2.85);
  building(south.body, south.decor, 8.95, 10.6, 10.2, D, ['n', 'w'], 2, 2.7);
  building(south.body, south.decor, 11.6, 9.6, W, D, ['n', 'w'], 3, 2.95);
  col(0, 9.6, 7.7, D);
  col(8.95, 10.6, 10.2, D);
  col(11.6, 9.6, W, D);
  // 동쪽, 서쪽 끝 (대로가 지나가는 틈은 비운다)
  building(east.body, east.decor, 15.5, 1.0, W, 5.6, ['w'], 1, 2.8);
  col(15.5, 0, W, 5.6);
  building(west.body, west.decor, 0, 1.85, 0.3, 5.6, ['e'], 2, 2.8);
  col(0, 0, 0.3, 5.6);

  // ---- 안쪽 두 블록: 카페 드 코드(서쪽), 레 되 자장(광장 모퉁이) ----
  const inner = new THREE.Group();
  const innerDecor = new THREE.Group();
  root.add(inner, innerDecor);
  building(inner, innerDecor, 0.3, 2.1, 3.7, 5.6, ['s', 'e', 'w', 'n'], 0, 2.8);
  building(inner, innerDecor, 4.7, 2.1, 8.1, 5.6, ['s', 'e', 'w', 'n'], 1, 2.9);
  col(0.3, 2.1, 3.7, 5.6);
  col(4.7, 2.1, 8.1, 5.6);
  awning(innerDecor, 0.4, 3.6, 5.6, 1, '#F3EFE4', '#2E6B4F', 'CAFÉ DE CODE');
  awning(innerDecor, 4.8, 8.0, 5.6, 1, '#234A3A', '#E8D49A', 'LES DEUX AGENTS');
  awning(south.decor, 0.2, 7.5, 9.6, -1, '#7A2E32', '#F3E3C3', 'BRASSERIE LOG');
  plaque(innerDecor, 'BD SAINT-GERMAIN', 7.55, 1.35, 5.62, 0);
  plaque(innerDecor, 'RUE BONAPARTE', 8.12, 1.35, 5.1, PI / 2);
  plaque(innerDecor, 'RUE ST-BENOÎT', 3.72, 1.35, 5.1, PI / 2);
  plaque(south.decor, 'RUE DE RENNES', 11.58, 1.35, 9.9, -PI / 2);

  // 레 되 자장 건물 벽: 오늘의 작업 현황 (공사 가림막 광고판처럼)
  box(innerDecor, 2.72, 1.76, 0.06, 6.4, 1.17, 5.64, '#1E2228', { r: 0.02, cast: false });
  const boardSurface = plane(
    innerDecor,
    2.5,
    1.56,
    new THREE.MeshStandardMaterial({ map: boardTexture || null, color: boardTexture ? '#FFFFFF' : '#FBFBF8', roughness: 0.5 }),
    6.4,
    2.05,
    5.68,
  );
  boardSurface.userData.keep = true;

  // ---- 생제르맹 데프레 성당: 서쪽 종탑, 신랑, 동쪽 반원 제단 ----
  const STONE = '#CDBFA6';
  const SLATE = '#56616B';
  {
    const tx = 11.5;
    const tz = 3.8;
    box(stat, 1.2, 2.9, 1.2, tx, 0, tz, STONE, { r: 0.03 });
    box(stat, 1.3, 0.1, 1.3, tx, 1.9, tz, '#BFB194', { r: 0.02 });
    box(stat, 1.3, 0.1, 1.3, tx, 2.85, tz, '#BFB194', { r: 0.02 });
    // 종탑 위 아치 창 (사방)
    for (const [dx, dz, ry] of [[0, -0.61, 0], [0, 0.61, 0], [-0.61, 0, PI / 2], [0.61, 0, PI / 2]])
      for (const o of [-0.22, 0.22]) {
        const ox = ry ? 0 : o;
        const oz = ry ? o : 0;
        box(stat, ry ? 0.04 : 0.2, 0.5, ry ? 0.2 : 0.04, tx + dx + ox, 2.2, tz + dz + oz, '#2E2A26', { r: 0.01, cast: false });
        cyl(stat, 0.1, 0.1, 0.04, tx + dx + ox, 2.7, tz + dz + oz, '#2E2A26', { seg: 12, rx: ry ? 0 : PI / 2, rz: ry ? PI / 2 : 0, cast: false });
      }
    // 뾰족 지붕 (네모 뿔) + 꼭대기 십자가
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.88, 1.45, 4), new THREE.MeshStandardMaterial({ color: SLATE, roughness: 0.6 }));
    spire.position.set(tx, 2.95 + 0.725, tz);
    spire.rotation.y = PI / 4;
    spire.castShadow = true;
    stat.add(spire);
    box(stat, 0.03, 0.26, 0.03, tx, 4.4, tz, '#D9B25C', { r: 0, cast: false });
    box(stat, 0.14, 0.03, 0.03, tx, 4.55, tz, '#D9B25C', { r: 0, cast: false });
    // 광장 쪽 정문
    box(stat, 0.06, 0.82, 0.5, 10.88, 0, tz, '#4A3626', { r: 0.01 });
    cyl(stat, 0.25, 0.25, 0.06, 10.88, 0.82, tz, '#4A3626', { seg: 14, rz: PI / 2, cast: false });
    box(stat, 0.05, 0.12, 0.62, 10.87, 0.95, tz, '#BFB194', { r: 0.01, cast: false });
    // 신랑: 돌벽 + 경사 지붕 두 장 + 아치 창과 버팀벽
    box(stat, 2.5, 1.85, 1.8, 13.35, 0, tz, STONE, { r: 0.02 });
    for (const s of [-1, 1]) {
      const rf = box(stat, 2.6, 0.06, 1.12, 13.35, 0, tz + s * 0.47, SLATE, { r: 0.01 });
      rf.position.y = 2.12;
      rf.rotation.x = s * 0.62;
    }
    for (let i = 0; i < 4; i++) {
      const x = 12.35 + i * 0.66;
      box(stat, 0.2, 0.5, 0.04, x, 0.95, tz + 0.91, '#3A3F4A', { r: 0.01, cast: false });
      cyl(stat, 0.1, 0.1, 0.04, x, 1.45, tz + 0.91, '#3A3F4A', { seg: 12, rx: PI / 2, cast: false });
      if (i < 3) box(stat, 0.12, 1.4, 0.18, x + 0.33, 0, tz + 0.95, '#C4B597', { r: 0.02 });
    }
    // 동쪽 반원 제단 + 둥근 지붕
    cyl(stat, 0.9, 0.9, 1.65, 14.6, 0, tz, STONE, { seg: 20 });
    const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(0.98, 0.55, 20), new THREE.MeshStandardMaterial({ color: SLATE, roughness: 0.6 }));
    apseRoof.position.set(14.6, 1.65 + 0.275, tz);
    apseRoof.castShadow = true;
    stat.add(apseRoof);
    col(10.9, 3.2, 12.1, 4.4);
    col(12.1, 2.9, 15.5, 4.7);
    // 성당 남쪽 뜰의 낮은 쇠울타리
    for (let x = 12.05; x < 15.5; x += 0.16) box(stat, 0.02, 0.32, 0.02, x, 0, 5.55, '#26292D', { r: 0, cast: false });
    box(stat, 3.45, 0.03, 0.03, 13.77, 0.3, 5.55, '#26292D', { r: 0, cast: false });
    col(12.0, 4.7, 15.5, 5.6);
  }

  // ---- 로랑 프라슈 공원: 나무 두 그루, 벤치, 피카소의 청동 두상 ----
  // platane: 대로의 플라타너스 (줄기가 얼룩덜룩한 회색)
  function tree(x, z, s = 1, platane = true) {
    cyl(stat, 0.07 * s, 0.1 * s, 1.5 * s, x, 0, z, platane ? '#8C8A7A' : '#6E5440', { seg: 8 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + R();
      ball(stat, 0.42 * s, x + Math.cos(a) * 0.3 * s, 1.75 * s + R() * 0.35 * s, z + Math.sin(a) * 0.3 * s, i % 2 ? '#5E9A4E' : '#6FAE5A', { s: [1, 0.85, 1] });
    }
    col(x - 0.12, z - 0.12, x + 0.12, z + 0.12);
  }
  tree(9.75, 3.75, 0.8, false);
  tree(10.65, 2.45, 0.75, false);
  // 벤치 (남쪽을 보고)
  box(stat, 1.05, 0.06, 0.34, 10.22, 0.36, 2.78, '#2F5A43', { r: 0.02 });
  box(stat, 1.05, 0.3, 0.05, 10.22, 0.42, 2.62, '#2F5A43', { r: 0.02, rx: -0.12 });
  for (const lx of [9.78, 10.66]) box(stat, 0.05, 0.36, 0.3, lx, 0, 2.78, '#26292D', { r: 0.01 });
  seat('sq1', 9.95, 2.82, 0, 0.36, 'sofa', { tableY: null });
  seat('sq2', 10.5, 2.82, 0, 0.36, 'sofa', { tableY: null });
  // 청동 두상 (받침 위)
  box(stat, 0.24, 0.62, 0.24, 10.62, 0, 3.75, '#D8D0C0', { r: 0.02 });
  ball(stat, 0.13, 10.62, 0.78, 3.75, '#5B4A33', { s: [0.85, 1.15, 0.9], mat: { metalness: 0.4, roughness: 0.45 } });
  col(10.48, 3.61, 10.76, 3.89);
  // 공원 낮은 울타리 (보나파르트 거리 쪽, 아베이 거리 쪽)
  for (let z = 2.2; z < 4.15; z += 0.16) box(stat, 0.02, 0.28, 0.02, 9.56, 0, z, '#26292D', { r: 0, cast: false });
  for (let x = 9.6; x < 10.85; x += 0.16) box(stat, 0.02, 0.28, 0.02, x, 0, 2.16, '#26292D', { r: 0, cast: false });

  // ---- 카페 테라스: 작은 원탁 하나에 의자 둘, 길을 보고 나란히 ----
  function bistroChair(x, z, h) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = h;
    stat.add(g);
    box(g, 0.36, 0.05, 0.34, 0, 0.27, 0, '#C9A15F', { r: 0.03 });
    box(g, 0.34, 0.3, 0.04, 0, 0.32, -0.16, '#B98C4B', { r: 0.02, rx: -0.12 });
    for (const [lx, lz] of [[-0.14, -0.13], [0.14, -0.13], [-0.14, 0.13], [0.14, 0.13]]) box(g, 0.025, 0.27, 0.025, lx, 0, lz, '#2A241C', { r: 0.005 });
  }
  function bistroTable(x, z) {
    cyl(stat, 0.24, 0.24, 0.03, x, 0.58, z, '#F1EEE7', { seg: 22 });
    cyl(stat, 0.025, 0.03, 0.58, x, 0, z, '#2A2D33', { seg: 8 });
    cyl(stat, 0.14, 0.15, 0.02, x, 0, z, '#2A2D33', { seg: 16 });
    if (R() < 0.5) cyl(stat, 0.035, 0.03, 0.07, x + 0.1, 0.61, z - 0.06, '#FFFFFF', { seg: 10, cast: false });
  }
  const terrace = (pre, xs, chairZ, tableZ, h) =>
    xs.forEach((tx, i) => {
      bistroTable(tx, tableZ);
      for (const [k, dx] of [[0, -0.26], [1, 0.26]]) {
        bistroChair(tx + dx, chairZ, h);
        seat(`${pre}${i * 2 + k + 1}`, tx + dx, chairZ, h, 0.3, 'chair', { tableY: 0.62, lapZ: 0.42 });
      }
    });
  terrace('fa', [0.95, 2.05, 3.15], 6.05, 6.47, 0);
  terrace('ma', [5.25, 6.4, 7.55], 6.05, 6.47, 0);
  terrace('br', [0.8, 2.0, 3.2, 4.4, 5.6, 6.8], 9.27, 8.87, PI);

  // ---- 광장의 사장님 자리 (성당 종탑을 옆에 두고 대로를 본다) ----
  bistroTable(10.2, 5.2);
  bistroChair(10.2, 4.75, 0);
  seat('boss', 10.2, 4.75, 0, 0.3, 'chair', { tableY: 0.62, lapZ: 0.45 });

  // ---- 메트로 4호선 입구 (에이전트가 여기로 출근한다) ----
  {
    box(stat, 1.2, 0.02, 0.6, 13.0, 0, 6.05, '#202227', { r: 0, cast: false });
    for (let i = 0; i < 4; i++) box(stat, 1.0, 0.02, 0.12, 13.0, 0.02, 5.82 + i * 0.13, i % 2 ? '#3A3D44' : '#2C2F35', { r: 0, cast: false });
    box(stat, 1.24, 0.42, 0.06, 13.0, 0, 5.75, '#2D4A3E', { r: 0.01 });
    for (const sx of [12.38, 13.62]) box(stat, 0.06, 0.42, 0.62, sx, 0, 6.05, '#2D4A3E', { r: 0.01 });
    cyl(stat, 0.035, 0.045, 1.55, 13.85, 0, 5.8, '#2D4A3E', { seg: 10 });
    const mt = canvasTex(128, 128, drawMetro, { transparent: true });
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), glowMat(mt));
    sign.material.transparent = true;
    sign.position.set(13.85, 1.62, 5.81);
    stat.add(sign);
    sign.userData.keep = true;
    const back = sign.clone();
    back.rotation.y = PI;
    back.position.z = 5.79;
    stat.add(back);
    col(12.35, 5.7, 13.65, 6.36);
    col(13.78, 5.73, 13.92, 5.87);
  }

  // ---- 거리 소품: 플라타너스, 가로등, 모리스 기둥(광고탑), 퀘벡 광장 분수 ----
  tree(11.45, 6.75, 1.05);
  tree(14.65, 6.75, 1.05);
  tree(12.35, 9.15, 1.0);
  tree(15.15, 9.15, 1.0);
  function lamp(x, z) {
    cyl(stat, 0.035, 0.05, 1.7, x, 0, z, '#2D4A3E', { seg: 10 });
    box(stat, 0.16, 0.22, 0.16, x, 1.7, z, '#F6E7B8', { r: 0.03, cast: false, mat: { emissive: '#FFD27A', emissiveIntensity: 0.5 } });
    box(stat, 0.2, 0.05, 0.2, x, 1.92, z, '#2D4A3E', { r: 0.02, cast: false });
    col(x - 0.06, z - 0.06, x + 0.06, z + 0.06);
  }
  lamp(4.3, 6.85);
  lamp(9.55, 6.85);
  lamp(10.45, 9.35);
  lamp(0.45, 9.35);
  // 모리스 기둥
  {
    const x = 13.7;
    const z = 9.1;
    cyl(stat, 0.3, 0.3, 0.12, x, 0, z, '#2D4A3E', { seg: 20 });
    const pt = canvasTex(512, 128, drawPosters);
    pt.wrapS = THREE.RepeatWrapping;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.25, 24, 1, true), texMat(pt, { roughness: 0.8 }));
    body.position.set(x, 0.12 + 0.625, z);
    body.castShadow = true;
    stat.add(body);
    body.userData.keep = true;
    cyl(stat, 0.31, 0.31, 0.1, x, 1.37, z, '#2D4A3E', { seg: 20 });
    ball(stat, 0.26, x, 1.47, z, '#2D4A3E', { s: [1, 0.55, 1] });
    ball(stat, 0.05, x, 1.66, z, '#2D4A3E', { cast: false });
    col(x - 0.32, z - 0.32, x + 0.32, z + 0.32);
  }
  // 퀘벡 광장: 얼음이 깨지는 모양의 분수 (기울어진 판 몇 장)
  {
    const x = 9.55;
    const z = 10.1;
    cyl(stat, 0.55, 0.58, 0.08, x, 0, z, '#9A958C', { seg: 24 });
    cyl(stat, 0.5, 0.5, 0.02, x, 0.07, z, '#7FB3D0', { seg: 24, cast: false, mat: { roughness: 0.15, metalness: 0.1 } });
    for (const [dx, dz, ry, rz] of [[-0.18, -0.1, 0.4, 0.5], [0.15, 0.08, -0.3, -0.45], [0.02, -0.22, 1.2, 0.35], [-0.05, 0.2, 2.2, -0.3]])
      box(stat, 0.36, 0.05, 0.26, x + dx, 0.12, z + dz, '#6F6A63', { r: 0.01, ry, rz });
    col(x - 0.58, z - 0.58, x + 0.58, z + 0.58);
  }

  mergeGroup(stat);
  mergeGroup(inner);
  for (const w of walls) {
    mergeGroup(w.body);
    mergeGroup(w.decor);
  }

  const zones = [
    { id: 'flore', name: 'Café de Code', x0: 0.3, z0: 5.6, x1: 3.7, z1: 7.0, desc: '길을 보고 나란히 앉는 테라스 자리.' },
    { id: 'magots', name: 'Les Deux Agents', x0: 4.7, z0: 5.6, x1: 8.1, z1: 7.0, desc: '성당이 보이는 광장 모퉁이 카페.' },
    { id: 'place', name: '생제르맹 데프레 광장', x0: 9.5, z0: 4.2, x1: 10.9, z1: 5.6, desc: '천 년 된 성당 종탑 앞 작은 광장이에요.' },
    { id: 'square', name: '로랑 프라슈 공원', x0: 9.5, z0: 2.1, x1: 10.9, z1: 4.2, desc: '피카소가 만든 청동 두상이 있는 작은 공원.' },
    { id: 'metro', name: '메트로 4호선', x0: 12.0, z0: 5.6, x1: 14.0, z1: 7.0, desc: '에이전트가 지하철로 출근해요.' },
    { id: 'blvd', name: '생제르맹 대로', x0: 0, z0: 7.0, x1: W, z1: 8.6, desc: '카페 테라스가 늘어선 큰길이에요.' },
    { id: 'lipp', name: 'Brasserie Log', x0: 0, z0: 8.6, x1: 7.7, z1: 9.6, desc: '대로 건너편 브라세리 테라스.' },
    { id: 'quebec', name: '퀘벡 광장', x0: 8.75, z0: 8.6, x1: 10.35, z1: 10.6, desc: '렌 거리가 시작되는 곳. 얼음이 깨지는 모양의 분수가 있어요.' },
  ];
  const spots = [
    { id: 'board', kind: 'board', x: 6.4, z: 6.75, r: 1.5, label: '현황판 보기' },
    { id: 'door', kind: 'door', x: 13.0, z: 6.62, r: 1.1, label: '나가기' },
  ];

  function update(dt) {
    for (const w of walls) {
      w.cut = damp(w.cut, w.target, 9, dt);
      w.body.scale.y = 1 - 0.95 * w.cut;
      w.decor.visible = w.cut < 0.45;
    }
  }
  function setCut(dirX, dirZ, enabled) {
    for (const w of walls) {
      const d = w.inner.x * dirX + w.inner.z * dirZ;
      w.target = enabled && d < -0.25 ? 1 : 0;
    }
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
    spawn: { x: 13.0, z: 6.75, h: 0 },
    update,
    setCut,
    toggleFridge: () => false,
    toggleTV: () => false,
  };
}
