// 비행기 맵: 하얀 벽과 타원 창문, 파란 좌석이 줄지어 있는 기내.
// 앞쪽(동쪽)부터 탑승구와 안내판 → 일등석 네 자리 → 일반석 여덟 줄 → 뒤쪽 갤리.
// 나는 일등석 창가에 앉고, 에이전트는 일반석 접이식 테이블에서 일한다. 쉬는 에이전트는 뒤쪽 갤리에 모인다.
// 비행기 밖에는 구름이 뒤로 흘러가고, 창가 자리에 앉아 '창문 보기'를 하면 그 창으로 밖을 내다본다 (sky).
import * as THREE from 'three';
import { mat, box, cyl, ball, plane, texMat, glowMat, mergeGroup } from './room.js';
import { canvasTex, rng, FONT_HAND, FONT_BODY } from './tex.js';
import { damp } from './util.js';

const W = 22; // 기내 길이 (x: 뒤 → 앞)
const D = 5.4; // 기내 너비 (z: 북쪽 창 → 남쪽 창)
const WALL_H = 2.5;
const PI = Math.PI;
const AISLE = [1.7, 3.7]; // 통로 (z)
const FWD = PI / 2; // 좌석은 모두 앞(+x)을 본다

const NAVY = '#2B3A7A';
const SEAT = '#3157B8';
const SEAT_L = '#5C7FD6';
const CREAM = '#EFE4D2';
const PANEL = '#F3F4F6';
const GRAY = '#C9CED6';

// 시각에 따른 하늘색: 위, 수평선, 내려다보이는 아래쪽, 구름
function skyColors(hour) {
  if (hour < 6 || hour >= 20) return { top: '#0B1535', low: '#27407A', deep: '#101C40', cloud: '#8E9FCC', night: true };
  if (hour >= 17) return { top: '#4A5FB0', low: '#F6B48A', deep: '#6E6FA8', cloud: '#FFE3CF', night: false };
  if (hour < 8) return { top: '#6FA9E6', low: '#FFD9B8', deep: '#7FA6D6', cloud: '#FFF3E6', night: false };
  return { top: '#2F7FD8', low: '#BFE3FA', deep: '#5E9FDB', cloud: '#FFFFFF', night: false };
}

// 타원 창문 한 장: 하얀 벽 판에 둥근 테두리, 그 안에 하늘과 구름
function drawWindow(g, w, h, hour) {
  const c = skyColors(hour);
  g.fillStyle = PANEL;
  g.fillRect(0, 0, w, h);
  const oval = (rx, ry) => {
    g.beginPath();
    g.ellipse(w / 2, h / 2, rx, ry, 0, 0, PI * 2);
  };
  oval(w * 0.44, h * 0.46);
  g.fillStyle = '#DADFE7';
  g.fill();
  oval(w * 0.38, h * 0.41);
  g.fillStyle = '#FFFFFF';
  g.fill();
  oval(w * 0.3, h * 0.34);
  const grd = g.createLinearGradient(0, h * 0.16, 0, h * 0.84);
  grd.addColorStop(0, c.top);
  grd.addColorStop(1, c.low);
  g.fillStyle = grd;
  g.fill();
  g.save();
  oval(w * 0.3, h * 0.34);
  g.clip();
  if (c.night) {
    const R = rng(11);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(255,255,230,${0.5 + R() * 0.5})`;
      g.fillRect(w * 0.2 + R() * w * 0.6, h * 0.18 + R() * h * 0.4, 2, 2);
    }
  }
  g.fillStyle = c.cloud;
  for (const [x, y, r] of [[0.34, 0.68, 0.13], [0.5, 0.72, 0.16], [0.66, 0.7, 0.12], [0.58, 0.62, 0.1]]) {
    g.beginPath();
    g.arc(w * x, h * y, w * r, 0, PI * 2);
    g.fill();
  }
  g.restore();
  // 반쯤 올린 가리개
  g.fillStyle = 'rgba(255,255,255,.55)';
  oval(w * 0.3, h * 0.34);
  g.save();
  g.clip();
  g.fillRect(0, 0, w, h * 0.27);
  g.restore();
}

// 바닥: 좌석 아래는 옅은 회청색, 통로는 남색 카펫, 일등석은 짙은 남색에 금색 선, 앞뒤 갤리는 밝은 장판 (1칸 = 50px)
function drawFloor(g, w, h) {
  const S = w / W;
  const R = rng(31);
  g.fillStyle = '#C5CEE0';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2600; k++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.16)' : 'rgba(60,80,130,.10)';
    g.fillRect(R() * w, R() * h, 2, 2);
  }
  // 통로 카펫
  g.fillStyle = NAVY;
  g.fillRect(0, AISLE[0] * S, w, (AISLE[1] - AISLE[0]) * S);
  for (let k = 0; k < 1500; k++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,30,.12)';
    g.fillRect(R() * w, AISLE[0] * S + R() * (AISLE[1] - AISLE[0]) * S, 3, 2);
  }
  // 통로 가장자리 유도등
  for (let x = 0.4; x < W; x += 0.55)
    for (const z of [AISLE[0] + 0.06, AISLE[1] - 0.06]) {
      g.fillStyle = 'rgba(255,224,150,.85)';
      g.fillRect(x * S, z * S - 1.5, 9, 3);
    }
  // 일등석 (x 14.3 ~ 19.6)
  g.fillStyle = '#22306A';
  g.fillRect(14.3 * S, 0, 5.3 * S, AISLE[0] * S);
  g.fillRect(14.3 * S, AISLE[1] * S, 5.3 * S, h - AISLE[1] * S);
  g.strokeStyle = '#D9B25C';
  g.lineWidth = 3;
  g.strokeRect(14.36 * S, 4, 5.18 * S, AISLE[0] * S - 8);
  g.strokeRect(14.36 * S, AISLE[1] * S + 4, 5.18 * S, h - AISLE[1] * S - 8);
  // 앞쪽 탑승구와 뒤쪽 갤리 장판
  g.fillStyle = '#DCE0E6';
  g.fillRect(19.6 * S, 0, w - 19.6 * S, AISLE[0] * S);
  g.fillRect(19.6 * S, AISLE[1] * S, w - 19.6 * S, h - AISLE[1] * S);
  g.fillRect(0, 0, 4.4 * S, AISLE[0] * S);
  g.fillRect(0, AISLE[1] * S, 4.4 * S, h - AISLE[1] * S);
  g.strokeStyle = 'rgba(120,130,150,.35)';
  g.lineWidth = 2;
  for (let x = 0.55; x < 4.4; x += 0.55) {
    g.beginPath();
    g.moveTo(x * S, 0);
    g.lineTo(x * S, AISLE[0] * S);
    g.moveTo(x * S, AISLE[1] * S);
    g.lineTo(x * S, h);
    g.stroke();
  }
}

// 출발 안내판: 다른 맵이 행선지로 나온다
function drawDepartures(g, w, h) {
  g.fillStyle = '#1B2447';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#FFD15C';
  g.font = `44px ${FONT_HAND}`;
  g.textAlign = 'left';
  g.fillText('출발 안내', 28, 58);
  g.fillStyle = '#8FA3E0';
  g.font = `600 22px ${FONT_BODY}`;
  g.textAlign = 'right';
  g.fillText('AGENT AIR', w - 28, 54);
  const rows = [
    ['AO 101', '작업실', '정시', '#7CE3A1'],
    ['AO 202', '카페', '탑승 중', '#FFD15C'],
    ['AO 303', '축구장', '정시', '#7CE3A1'],
    ['AO 404', '파리', '지연', '#FF8F7A'],
  ];
  rows.forEach(([no, to, st, c], i) => {
    const y = 96 + i * 56;
    g.fillStyle = i % 2 ? '#222D58' : '#2A3768';
    g.fillRect(18, y, w - 36, 46);
    g.textAlign = 'left';
    g.fillStyle = '#C8D3F5';
    g.font = `600 24px ${FONT_BODY}`;
    g.fillText(no, 32, y + 32);
    g.fillStyle = '#FFFFFF';
    g.font = `28px ${FONT_HAND}`;
    g.fillText(to, 150, y + 33);
    g.textAlign = 'right';
    g.fillStyle = c;
    g.font = `700 22px ${FONT_BODY}`;
    g.fillText(st, w - 32, y + 32);
  });
}

function drawSkyDome(g, w, h, hour) {
  const c = skyColors(hour);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, c.top);
  grd.addColorStop(0.5, c.low);
  grd.addColorStop(0.56, c.low);
  grd.addColorStop(0.8, c.deep);
  grd.addColorStop(1, c.deep);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const R = rng(77);
  if (c.night) {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,235,${0.35 + R() * 0.65})`;
      const s = R() < 0.1 ? 3 : 2;
      g.fillRect(R() * w, R() * h * 0.46, s, s);
    }
    g.fillStyle = '#FFF6D2';
    g.beginPath();
    g.arc(w * 0.26, h * 0.3, 16, 0, PI * 2);
    g.fill();
  } else {
    // 해와 번짐
    const sx = w * 0.26;
    const sy = h * 0.34;
    const halo = g.createRadialGradient(sx, sy, 4, sx, sy, 150);
    halo.addColorStop(0, 'rgba(255,250,225,.95)');
    halo.addColorStop(0.2, 'rgba(255,244,200,.45)');
    halo.addColorStop(1, 'rgba(255,244,200,0)');
    g.fillStyle = halo;
    g.fillRect(sx - 160, sy - 160, 320, 320);
  }
  // 수평선에 깔린 먼 구름 (멀수록 납작하게)
  g.fillStyle = c.cloud;
  for (let band = 0; band < 3; band++) {
    g.globalAlpha = [0.55, 0.75, 0.9][band];
    const y = h * (0.515 + band * 0.022);
    for (let x = -20; x < w + 20; x += 16 + R() * 26) {
      g.beginPath();
      g.ellipse(x, y + R() * 5, 20 + R() * 30, 3.5 + band * 2.4 + R() * 3, 0, 0, PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

export function buildAirplane(scene, { boardTexture } = {}) {
  const root = new THREE.Group();
  root.name = 'airplane';
  scene.add(root);
  const stat = new THREE.Group();
  root.add(stat);
  const R = rng(747);
  const colliders = [];
  const seats = [];
  const walls = [];
  const col = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const seat = (id, x, z, h, y, kind, extra = {}) => seats.push({ id, x, z, h, y, kind, ...extra });
  let hour = new Date().getHours();

  // ---- 동체 바닥판과 기내 바닥 ----
  box(stat, W + 0.8, 0.5, D + 0.8, W / 2, -0.51, D / 2, '#E6E9EF', { r: 0.2, cast: false });
  box(stat, W + 0.84, 0.1, D + 0.84, W / 2, -0.36, D / 2, NAVY, { r: 0.04, cast: false });
  const floorTex = canvasTex(1100, 270, drawFloor);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
  floor.rotation.x = -PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- 벽: 하얀 내장 판, 아래는 옅은 회색 ----
  function wall(name, cx, cz, len, alongX, inner) {
    const g = new THREE.Group();
    root.add(g);
    const body = new THREE.Group();
    const decor = new THREE.Group();
    g.add(body, decor);
    const t = 0.2;
    box(body, alongX ? len : t, WALL_H, alongX ? t : len, cx - (inner.x * t) / 2, 0, cz - (inner.z * t) / 2, PANEL, { r: 0.04, cast: false });
    const ix = (d) => cx + inner.x * d;
    const iz = (d) => cz + inner.z * d;
    const L = len - 0.02;
    box(body, alongX ? L : 0.03, 0.5, alongX ? 0.03 : L, ix(0.015), 0, iz(0.015), '#DDE1E8', { r: 0.008, cast: false });
    box(body, alongX ? L : 0.04, 0.05, alongX ? 0.04 : L, ix(0.02), 0.5, iz(0.02), '#B9C2D6', { r: 0.008, cast: false });
    const w = { name, group: g, body, decor, inner, cut: 0, target: 0 };
    walls.push(w);
    return w;
  }
  const north = wall('north', W / 2, 0, W + 0.4, true, { x: 0, z: 1 });
  const south = wall('south', W / 2, D, W + 0.4, true, { x: 0, z: -1 });
  const west = wall('west', 0, D / 2, D, false, { x: 1, z: 0 });
  const east = wall('east', W, D / 2, D, false, { x: -1, z: 0 });

  // 창문: 좌석 줄마다 하나 (북쪽, 남쪽 벽)
  const winTex = canvasTex(160, 208, (g, w, h) => drawWindow(g, w, h, hour));
  const winMat = glowMat(winTex);
  const ECO_X = [13.0, 11.9, 10.8, 9.7, 8.6, 7.5, 6.4, 5.3]; // 일반석 줄 (앞 → 뒤)
  const FC_X = [18.0, 15.6]; // 일등석 줄
  const WIN_X = [...ECO_X.map((x) => x + 0.15), 18.45, 17.55, 16.05, 15.15, 3.4, 2.2];
  for (const wx of WIN_X) {
    plane(north.decor, 0.5, 0.65, winMat, wx, 1.22, 0.012);
    plane(south.decor, 0.5, 0.65, winMat, wx, 1.22, D - 0.012, PI);
  }
  // 머리 위 짐칸 (창문을 가리지 않게 얕게)
  for (const [w, z, s] of [[north, 0.12, 1], [south, D - 0.12, -1]]) {
    box(w.decor, 15.4, 0.36, 0.24, 11.9, 2.02, z, '#E9ECF1', { r: 0.06, cast: false });
    for (let x = 4.6; x < 19.4; x += 1.1) box(w.decor, 0.02, 0.3, 0.02, x, 2.05, z + s * 0.12, '#C3C9D4', { r: 0, cast: false });
    box(w.decor, 15.4, 0.03, 0.05, 11.9, 1.98, z + s * 0.1, '#FFE9B8', { r: 0.01, cast: false, mat: { emissive: '#FFD98A', emissiveIntensity: 0.6 } });
  }

  // ---- 앞 칸막이(동쪽 벽): 현황판, 출발 안내판, 커튼, 둥근 보관함 ----
  let boardSurface;
  {
    const x = W - 0.012;
    // 오늘의 작업 현황 (북쪽 반)
    box(east.decor, 0.07, 1.36, 2.08, W - 0.035, 0.9, 1.22, '#2A3350', { r: 0.03, cast: false });
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture || null, color: boardTexture ? '#FFFFFF' : '#FBFBF8', roughness: 0.45 });
    boardSurface = plane(east.decor, 1.92, 1.2, boardMat, W - 0.076, 1.58, 1.22, -PI / 2);
    boardSurface.userData.keep = true;
    // 출발 안내판 (남쪽 반)
    box(east.decor, 0.07, 1.1, 1.72, W - 0.035, 1.05, 4.3, '#2A3350', { r: 0.03, cast: false });
    plane(east.decor, 1.6, 0.98, glowMat(canvasTex(512, 320, drawDepartures)), W - 0.076, 1.6, 4.3, -PI / 2).userData.keep = true;
    // 조종실로 가는 커튼
    box(east.decor, 0.05, 2.06, 1.1, x - 0.02, 0, D / 2, '#C9CED6', { r: 0.01, cast: false });
    for (let i = 0; i < 6; i++) box(east.decor, 0.07 + (i % 2) * 0.03, 1.96, 0.17, x - 0.06, 0.02, D / 2 - 0.43 + i * 0.172, i % 2 ? '#22306A' : NAVY, { r: 0.03, cast: false });
    cyl(east.decor, 0.02, 0.02, 1.16, x - 0.07, 2.02, D / 2, '#D9B25C', { rx: PI / 2, seg: 8, cast: false });
    // 둥근 보관함
    for (const z of [0.7, 1.75, 3.8, 4.8]) {
      cyl(east.decor, 0.3, 0.3, 0.05, x - 0.02, 0.5, z, '#D7DCE4', { rz: PI / 2, seg: 28, cast: false });
      cyl(east.decor, 0.22, 0.22, 0.06, x - 0.03, 0.5, z, '#EEF0F4', { rz: PI / 2, seg: 28, cast: false });
      box(east.decor, 0.03, 0.05, 0.16, x - 0.07, 0.48, z, '#9AA3B2', { r: 0.01, cast: false });
    }
  }
  // 탑승구 (북쪽 벽 앞쪽)
  box(north.decor, 1.1, 2.12, 0.05, 20.7, 0, 0.025, '#C9CED6', { r: 0.02, cast: false });
  box(north.decor, 0.98, 2.02, 0.06, 20.7, 0.02, 0.04, '#E9ECF1', { r: 0.06, cast: false });
  plane(north.decor, 0.34, 0.44, winMat, 20.7, 1.5, 0.075);
  box(north.decor, 0.5, 0.08, 0.06, 20.7, 0.98, 0.08, '#E5484D', { r: 0.02, cast: false });
  box(north.decor, 0.5, 0.2, 0.04, 20.7, 2.18, 0.03, '#2FA35A', { r: 0.02, cast: false, mat: { emissive: '#2FA35A', emissiveIntensity: 0.5 } });
  // 뒤쪽 화장실 문 (서쪽 벽)
  for (const z of [1.0, 4.4]) {
    box(west.decor, 0.05, 1.96, 0.8, 0.03, 0, z, '#E3E6EB', { r: 0.02, cast: false });
    box(west.decor, 0.04, 0.1, 0.3, 0.06, 1.7, z, '#3157B8', { r: 0.02, cast: false });
    cyl(west.decor, 0.03, 0.03, 0.1, 0.08, 0.98, z + 0.28, '#9AA3B2', { rz: PI / 2, seg: 10, cast: false });
  }

  // ---- 일반석 ----
  function ecoSeat(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = FWD;
    stat.add(g);
    box(g, 0.42, 0.2, 0.34, 0, 0, 0, '#8B93A1', { r: 0.03 });
    box(g, 0.54, 0.14, 0.52, 0, 0.2, 0.02, SEAT, { r: 0.05 });
    box(g, 0.54, 0.74, 0.13, 0, 0.3, -0.27, SEAT, { r: 0.05, rx: -0.1 });
    box(g, 0.42, 0.2, 0.1, 0, 0.9, -0.34, SEAT_L, { r: 0.04, rx: -0.1 });
    for (const s of [-1, 1]) box(g, 0.07, 0.07, 0.44, s * 0.31, 0.42, 0, GRAY, { r: 0.02 });
    // 접이식 테이블 (앞좌석 등받이에 붙어 있다)
    box(g, 0.44, 0.025, 0.27, 0, 0.6, 0.6, '#E8EBF0', { r: 0.008 });
  }
  ECO_X.forEach((x, r) => {
    [[0.72, 'a', -1], [1.4, 'b', 0], [4.0, 'c', 0], [4.68, 'd', 1]].forEach(([z, k, side]) => {
      ecoSeat(x, z);
      seat(`e${r + 1}${k}`, x, z, FWD, 0.34, 'chair', { tableY: 0.625, lapZ: 0.6, ...(side ? { win: side } : {}) });
    });
  });
  // 맨 앞줄 테이블은 칸막이에 붙는다
  for (const z of [0.72, 1.4, 4.0, 4.68]) box(stat, 0.52, 0.03, 0.05, 13.86, 0.6, z, GRAY, { r: 0.01 });

  // ---- 일등석: 넓은 가죽 좌석, 발 받침, 곁 탁자, 앞 화면 ----
  function suite(id, x, z, ws) {
    // ws: 창이 있는 쪽 (좌석 기준 오른쪽 +1 = 북쪽 창, -1 = 남쪽 창)
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = FWD;
    stat.add(g);
    const a = -ws; // 통로 쪽
    box(g, 1.24, 1.12, 0.1, a * 0.1, 0, -0.56, '#F1EEE8', { r: 0.05 });
    box(g, 1.24, 0.06, 0.12, a * 0.1, 1.1, -0.56, '#D9B25C', { r: 0.02 });
    box(g, 0.72, 0.22, 0.4, 0, 0, 0, '#8B93A1', { r: 0.04 });
    box(g, 0.8, 0.18, 0.72, 0, 0.22, 0.02, CREAM, { r: 0.07 });
    box(g, 0.8, 0.86, 0.16, 0, 0.36, -0.36, CREAM, { r: 0.07, rx: -0.14 });
    box(g, 0.5, 0.2, 0.1, 0, 1.02, -0.47, '#FFFFFF', { r: 0.05, rx: -0.14 });
    box(g, 0.1, 0.1, 0.6, ws * 0.44, 0.5, 0, CREAM, { r: 0.04 });
    // 통로 쪽 곁 탁자
    box(g, 0.34, 0.56, 0.78, a * 0.64, 0, -0.12, '#F1EEE8', { r: 0.04 });
    box(g, 0.36, 0.03, 0.8, a * 0.64, 0.56, -0.12, '#B98D63', { r: 0.01 });
    cyl(g, 0.035, 0.02, 0.1, a * 0.64, 0.59, 0.1, '#FFF1C9', { seg: 10, mat: { transparent: true, opacity: 0.8 } });
    cyl(g, 0.05, 0.07, 0.12, a * 0.64, 0.59, -0.3, '#FFE2BD', { seg: 12, mat: { emissive: '#FFB36B', emissiveIntensity: 0.6 } });
    // 내 앞 탁자
    box(g, 0.56, 0.03, 0.34, 0, 0.6, 0.56, '#FFFFFF', { r: 0.01 });
    box(g, 0.05, 0.03, 0.34, a * 0.36, 0.585, 0.56, '#B98D63', { r: 0.01 });
    // 발 받침과 앞 화면
    box(g, 0.62, 0.3, 0.36, 0, 0, 1.3, CREAM, { r: 0.06 });
    box(g, 1.24, 1.0, 0.08, a * 0.1, 0, 1.66, '#F1EEE8', { r: 0.04 });
    box(g, 0.66, 0.4, 0.03, 0, 0.5, 1.61, '#1F2A44', { r: 0.02, mat: { emissive: '#27407A', emissiveIntensity: 0.5 } });
    seat(id, x, z, FWD, 0.4, 'sofa', { tableY: 0.63, lapZ: 0.56, win: ws > 0 ? -1 : 1, first: true });
    // 뒤 껍데기, 곁 탁자, 발 받침, 앞 칸막이는 지나갈 수 없다 (곁 탁자 앞쪽 틈으로 통로와 드나든다)
    const zc = z + ws * 0.1; // 곁 탁자까지 포함한 가운데 (북쪽 좌석은 통로가 +z 쪽)
    col(x - 0.62, zc - 0.62, x - 0.5, zc + 0.62);
    col(x + 1.12, z - 0.31, x + 1.48, z + 0.31);
    col(x + 1.62, zc - 0.62, x + 1.72, zc + 0.62);
    const tz = z + ws * 0.64;
    col(x - 0.5, tz - 0.17, x + 0.27, tz + 0.17);
  }
  suite('boss', FC_X[0], 0.95, 1);
  suite('f2', FC_X[0], 4.45, -1);
  suite('f3', FC_X[1], 0.95, 1);
  suite('f4', FC_X[1], 4.45, -1);

  // 일등석과 일반석 사이 칸막이와 커튼
  for (const [z0, z1] of [[0, AISLE[0]], [AISLE[1], D]]) {
    box(stat, 0.12, 1.86, z1 - z0, 14.2, 0, (z0 + z1) / 2, '#EEF0F4', { r: 0.04 });
    box(stat, 0.14, 0.06, z1 - z0, 14.2, 1.84, (z0 + z1) / 2, '#D9B25C', { r: 0.02 });
    col(14.1, z0, 14.3, z1);
  }
  for (const z of [AISLE[0] + 0.12, AISLE[1] - 0.12]) box(stat, 0.1, 1.7, 0.22, 14.2, 0.04, z, NAVY, { r: 0.06 });

  // ---- 기내식 수레 (통로) ----
  {
    const cx = 9.15;
    const cz = 2.28;
    box(stat, 0.74, 0.04, 0.46, cx, 0.74, cz, '#E3E6EB', { r: 0.015 });
    box(stat, 0.74, 0.03, 0.46, cx, 0.36, cz, '#E3E6EB', { r: 0.01 });
    for (const dx of [-0.34, 0.34]) for (const dz of [-0.2, 0.2]) box(stat, 0.035, 0.76, 0.035, cx + dx, 0.04, cz + dz, '#AEB5C1', { r: 0.01 });
    for (const dx of [-0.34, 0.34]) for (const dz of [-0.2, 0.2]) cyl(stat, 0.045, 0.045, 0.03, cx + dx, 0.045, cz + dz, '#3A3D42', { rx: PI / 2, seg: 12 });
    // 빵 바구니와 주전자
    box(stat, 0.36, 0.12, 0.3, cx - 0.14, 0.78, cz, '#C9965A', { r: 0.03 });
    for (let i = 0; i < 6; i++)
      ball(stat, 0.075, cx - 0.26 + (i % 3) * 0.12, 0.93 + (i % 2) * 0.03, cz - 0.07 + Math.floor(i / 3) * 0.14, ['#E8B36A', '#D98F4E', '#F2D0A4'][i % 3], { s: [1.25, 0.8, 1], cast: false });
    cyl(stat, 0.07, 0.09, 0.2, cx + 0.2, 0.78, cz - 0.04, '#B9C2D6', { seg: 14, mat: { metalness: 0.5, roughness: 0.3 } });
    for (let i = 0; i < 3; i++) cyl(stat, 0.035, 0.03, 0.07, cx - 0.2 + i * 0.16, 0.39, cz + 0.08, '#FFFFFF', { seg: 10, cast: false });
    col(cx - 0.4, cz - 0.26, cx + 0.4, cz + 0.26);
  }

  // ---- 앞쪽 탑승구 옆 안내대 ----
  box(stat, 1.5, 0.92, 0.6, 20.8, 0, D - 0.42, '#EEF0F4', { r: 0.04 });
  box(stat, 1.56, 0.05, 0.66, 20.8, 0.92, D - 0.42, NAVY, { r: 0.02 });
  for (let i = 0; i < 3; i++) cyl(stat, 0.05, 0.045, 0.1, 20.4 + i * 0.2, 0.97, D - 0.4, '#FFFFFF', { seg: 12, cast: false });
  ball(stat, 0.1, 21.25, 1.12, D - 0.42, '#62B46E', { s: [1, 1.4, 1], cast: false });
  cyl(stat, 0.07, 0.055, 0.1, 21.25, 0.97, D - 0.42, '#C46A4A', { seg: 12, cast: false });
  col(20.02, D - 0.75, 21.6, D);

  // ---- 뒤쪽 갤리: 조리대, 커피, 쉬는 긴 의자 ----
  {
    box(stat, 0.62, 0.92, 1.9, 0.42, 0, D / 2, '#E3E6EB', { r: 0.04 });
    box(stat, 0.68, 0.05, 1.96, 0.42, 0.92, D / 2, '#AEB5C1', { r: 0.02, mat: { metalness: 0.4, roughness: 0.4 } });
    box(stat, 0.4, 0.4, 0.36, 0.4, 0.97, D / 2 - 0.55, '#C9CDD2', { r: 0.04, mat: { metalness: 0.5, roughness: 0.35 } });
    cyl(stat, 0.07, 0.08, 0.2, 0.42, 0.97, D / 2 + 0.1, '#2A2420', { seg: 14 });
    for (let i = 0; i < 4; i++) cyl(stat, 0.04, 0.035, 0.07, 0.34 + (i % 2) * 0.16, 0.97, D / 2 + 0.45 + Math.floor(i / 2) * 0.14, '#FFFFFF', { seg: 10, cast: false });
    for (let i = 0; i < 4; i++) box(stat, 0.02, 0.36, 0.42, 0.74, 0.1 + Math.floor(i / 2) * 0.42, D / 2 - 0.46 + (i % 2) * 0.92, '#AEB5C1', { r: 0.005, cast: false });
    col(0.1, D / 2 - 0.98, 0.76, D / 2 + 0.98);
    // 긴 의자 (북쪽 창 아래)
    box(stat, 2.2, 0.26, 0.6, 3.0, 0.04, 0.42, SEAT, { r: 0.06 });
    box(stat, 2.2, 0.5, 0.16, 3.0, 0.28, 0.16, SEAT, { r: 0.06 });
    for (const x of [2.0, 4.0]) box(stat, 0.16, 0.42, 0.6, x, 0.04, 0.42, SEAT_L, { r: 0.06 });
    col(1.9, 0, 4.1, 0.74);
    [2.5, 3.5].forEach((x, i) => seat(`bench${i + 1}`, x, 0.46, 0, 0.3, 'sofa', { tableY: null }));
    // 잡지꽂이
    box(stat, 0.7, 0.8, 0.16, 3.0, 0, D - 0.1, '#EEF0F4', { r: 0.03 });
    ['#E5484D', '#FFD15C', '#3FA66B', '#3D6FD8'].forEach((c, i) => box(stat, 0.14, 0.2, 0.03, 2.76 + i * 0.16, 0.5, D - 0.2, c, { r: 0.005, rx: 0.2, cast: false }));
    col(2.6, D - 0.24, 3.4, D);
  }

  // ---- 밖에서 보이는 비행기 모양: 기수, 날개와 엔진, 꼬리 ----
  const body = '#E6E9EF';
  ball(stat, (D + 0.8) / 2, W + 0.35, -0.26, D / 2, body, { s: [1.7, 0.08, 1], seg: 28, cast: false });
  ball(stat, (D + 0.8) / 2, -0.35, -0.26, D / 2, body, { s: [2.6, 0.08, 1], seg: 28, cast: false });
  box(stat, 1.5, 0.04, 2.6, W + 2.6, -0.2, D / 2, '#27324F', { r: 0.02, cast: false }); // 조종석 창
  const wingMat = mat('#DDE1E8', { roughness: 0.6 });
  function wing(pts, y) {
    const s = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
    s.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }), wingMat);
    m.rotation.x = PI / 2; // 그림의 y → 맵의 z
    m.position.y = y;
    m.receiveShadow = true;
    stat.add(m);
  }
  wing([[12.8, -0.3], [8.4, -0.3], [5.6, -7.6], [6.8, -7.6]], -0.2);
  wing([[12.8, D + 0.3], [8.4, D + 0.3], [5.6, D + 7.6], [6.8, D + 7.6]], -0.2);
  wing([[-1.2, -0.2], [-3.6, -0.2], [-5.2, -3.2], [-4.4, -3.2]], -0.22);
  wing([[-1.2, D + 0.2], [-3.6, D + 0.2], [-5.2, D + 3.2], [-4.4, D + 3.2]], -0.22);
  for (const z of [-2.7, D + 2.7]) {
    cyl(stat, 0.46, 0.4, 1.7, 11.3, -0.86, z, '#EEF0F4', { rz: PI / 2, seg: 22, cast: false });
    cyl(stat, 0.36, 0.36, 0.06, 12.16, -0.86, z, '#27324F', { rz: PI / 2, seg: 22, cast: false });
    box(stat, 1.0, 0.3, 0.1, 11.0, -0.6, z, '#DDE1E8', { r: 0.03, cast: false });
  }
  for (const [z, lean] of [[-7.6, 0.5], [D + 7.6, -0.5]]) box(stat, 1.1, 0.9, 0.08, 6.1, -0.2, z, '#FF8A3D', { r: 0.03, rx: lean, cast: false });
  // 꼬리 날개
  box(stat, 2.2, 2.6, 0.14, -3.4, -0.3, D / 2, NAVY, { r: 0.05, rz: 0.42, cast: false });
  box(stat, 1.0, 0.5, 0.15, -3.6, 1.5, D / 2, '#FF8A3D', { r: 0.04, rz: 0.42, cast: false });

  mergeGroup(stat);
  for (const w of walls) {
    mergeGroup(w.body);
    mergeGroup(w.decor);
  }

  // ---- 구름: 비행기 아래와 옆으로 뒤로 흘러간다 (한 번에 그리는 묶음) ----
  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const p = { x: -18 + R() * 60, y: -3.2 - R() * 5.5, z: -22 + R() * (D + 44), parts: [] };
    const n = 3 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) p.parts.push({ dx: (k - n / 2) * 0.62 + R() * 0.3, dy: R() * 0.25, dz: (R() - 0.5) * 0.9, r: 0.5 + R() * 0.6 });
    puffs.push(p);
  }
  const partCount = puffs.reduce((n, p) => n + p.parts.length, 0);
  const cloudMat = new THREE.MeshStandardMaterial({ color: skyColors(hour).cloud, roughness: 1, emissive: skyColors(hour).cloud, emissiveIntensity: 0.38 });
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), cloudMat, partCount);
  clouds.frustumCulled = false;
  clouds.castShadow = false;
  clouds.receiveShadow = false;
  root.add(clouds);
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  function placeClouds() {
    let i = 0;
    for (const p of puffs)
      for (const c of p.parts) {
        _p.set(p.x + c.dx, p.y + c.dy, p.z + c.dz);
        _s.set(c.r, c.r * 0.5, c.r);
        clouds.setMatrixAt(i++, _m.compose(_p, _q, _s));
      }
    clouds.instanceMatrix.needsUpdate = true;
  }
  placeClouds();

  // ---- 창밖 풍경: 하늘은 '창문 보기'를 할 때만 켠다 (위에서 볼 때는 배경이 그대로 보이게) ----
  const domeTex = canvasTex(1024, 1024, (g, w, h) => drawSkyDome(g, w, h, hour));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 20), new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, toneMapped: false, depthWrite: false }));
  dome.renderOrder = -2;
  dome.visible = false;
  root.add(dome);
  const _eye = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const WING = { x: 8.6, out: 4.4 }; // 날개 가운데쯤 (동체에서 4.4만큼 바깥)
  const sky = {
    show(on) {
      dome.visible = on;
    },
    // 그 자리 창에 눈을 대고 내다보는 카메라: 날개가 보이게 그쪽으로 고개를 돌린다 (앞자리는 뒤를, 뒷자리는 앞을)
    place(camera, st, t) {
      const side = st.win; // -1 북쪽 창, 1 남쪽 창
      _eye.set(st.x + 0.15, 1.26 + Math.sin(t * 0.7) * 0.012, side < 0 ? -0.42 : D + 0.42);
      const yaw = Math.max(-0.95, Math.min(0.95, Math.atan2(WING.x - _eye.x, WING.out) * 0.82));
      _look.set(_eye.x + Math.sin(yaw), _eye.y - 0.2, _eye.z + side * Math.cos(yaw));
      camera.position.copy(_eye);
      camera.lookAt(_look);
      dome.position.copy(_eye);
    },
  };

  const zones = [
    { id: 'gate', name: '탑승구', x0: 19.6, z0: 0, x1: W, z1: D, desc: '어서 오세요. 오늘의 작업 현황과 출발 안내가 붙어 있어요.' },
    { id: 'first', name: '일등석', x0: 14.3, z0: 0, x1: 19.6, z1: D, desc: '넓은 가죽 좌석과 발 받침이 있는 자리.' },
    { id: 'economy', name: '일반석', x0: 4.4, z0: 0, x1: 14.1, z1: D, desc: '접이식 테이블을 펴고 일하는 파란 좌석.' },
    { id: 'galley', name: '갤리', x0: 0, z0: 0, x1: 4.4, z1: D, desc: '커피를 내리고 쉬어 가는 뒤쪽 갤리.' },
  ];
  const spots = [
    { id: 'board', kind: 'board', x: 21.0, z: 1.3, r: 1.5, label: '현황판 보기' },
    { id: 'door', kind: 'door', x: 20.7, z: 0.85, r: 1.15, label: '내리기' },
  ];

  let acc = 0;
  function update(dt) {
    for (const w of walls) {
      w.cut = damp(w.cut, w.target, 9, dt);
      w.body.scale.y = 1 - 0.95 * w.cut;
      w.decor.visible = w.cut < 0.45;
    }
    // 구름은 뒤(-x)로 흘러가고, 꼬리 뒤로 사라지면 기수 앞에서 다시 나온다
    for (const p of puffs) {
      p.x -= dt * (1.5 + (p.y < -4 ? 0.5 : 1.1));
      if (p.x < -22) p.x += 64;
    }
    placeClouds();
    acc += dt;
    if (acc > 30) {
      acc = 0;
      const h = new Date().getHours();
      if (h !== hour) {
        hour = h;
        drawWindow(winTex.userData.ctx, winTex.userData.canvas.width, winTex.userData.canvas.height, h);
        winTex.needsUpdate = true;
        drawSkyDome(domeTex.userData.ctx, domeTex.userData.canvas.width, domeTex.userData.canvas.height, h);
        domeTex.needsUpdate = true;
        cloudMat.color.set(skyColors(h).cloud);
        cloudMat.emissive.set(skyColors(h).cloud);
      }
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
    sky,
    spawn: { x: 20.7, z: 1.1, h: PI },
    update,
    setCut,
    toggleFridge: () => false,
    toggleTV: () => false,
  };
}
