// 해변 맵: 북쪽은 바다, 모래 위에 선베드와 파라솔, 해변 바, 파라솔 테이블.
// 선베드(kind: 'sunbed')에는 눕는다. 작업실(room.js)과 같은 크기(16 × 12)와 같은 모양의 결과를 돌려준다.
import * as THREE from 'three';
import { mat, box, cyl, ball, plane, texMat, mergeGroup } from './room.js';
import { canvasTex, rng } from './tex.js';

const W = 16;
const D = 12;
const PI = Math.PI;
const SHORE = 2.5; // 여기까지 바다

function drawSand(g, w, h) {
  g.fillStyle = '#F3E0B5';
  g.fillRect(0, 0, w, h);
  const R = rng(31);
  // 바람이 만든 잔물결
  g.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const y = R() * h;
    const x = R() * w;
    g.strokeStyle = R() < 0.5 ? 'rgba(190,150,90,.10)' : 'rgba(255,250,235,.22)';
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 40, y - 6, x + 90, y + 6, x + 130 + R() * 60, y);
    g.stroke();
  }
  for (let k = 0; k < 1500; k++) {
    g.fillStyle = R() < 0.5 ? 'rgba(160,120,70,.13)' : 'rgba(255,255,255,.3)';
    g.fillRect(R() * w, R() * h, 1.5 + R() * 2, 1.5 + R() * 2);
  }
}
// 파라솔 천: 둘레를 따라 색과 흰색이 번갈아 온다
function drawStripes(color) {
  return (g, w, h) => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#FFFDF6' : color;
      g.fillRect((i * w) / n, 0, w / n + 1, h);
    }
  };
}
// 물가의 하얀 거품 띠
function drawFoam(g, w, h) {
  g.clearRect(0, 0, w, h);
  const R = rng(9);
  g.fillStyle = 'rgba(255,255,255,.95)';
  for (let x = 0; x < w + 30; x += 26) {
    g.beginPath();
    g.ellipse(x + R() * 8, h * 0.62, 20 + R() * 8, h * (0.2 + R() * 0.16), 0, 0, PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.fillRect(0, 0, w, h * 0.55);
}

export function buildBeach(scene, { boardTexture } = {}) {
  const root = new THREE.Group();
  root.name = 'beach';
  scene.add(root);
  const stat = new THREE.Group();
  root.add(stat);
  const R = rng(777);
  const colliders = [];
  const seats = [];
  const col = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const seat = (id, x, z, h, y, kind, extra = {}) => seats.push({ id, x, z, h, y, kind, ...extra });

  // ---- 받침대, 모래, 바다 ----
  box(stat, W + 0.8, 0.5, D + 0.8, W / 2, -0.51, D / 2, '#D9BC8A', { r: 0.1, cast: false });
  box(stat, W + 0.82, 0.5, SHORE + 0.9, W / 2, -0.5, SHORE / 2 - 0.25, '#2E9BBD', { r: 0.1, cast: false });
  const sandTex = canvasTex(512, 512, drawSand);
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(W / 4, D / 4);
  const flat = (w, d, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  flat(W, D, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 }), W / 2, 0, D / 2);
  flat(W, 0.9, new THREE.MeshStandardMaterial({ color: '#DDBF86', roughness: 0.6, transparent: true, opacity: 0.75 }), W / 2, 0.004, SHORE + 0.3); // 젖은 모래
  flat(W, SHORE, new THREE.MeshStandardMaterial({ color: '#5CCBDD', roughness: 0.25 }), W / 2, 0.02, SHORE / 2);
  flat(W, 1.3, new THREE.MeshStandardMaterial({ color: '#2FA7C9', roughness: 0.25, transparent: true, opacity: 0.85 }), W / 2, 0.024, 0.65); // 깊은 쪽
  // 밀려오는 파도와 물가 거품 (움직인다)
  const foamTex = canvasTex(512, 32, drawFoam);
  foamTex.wrapS = THREE.RepeatWrapping;
  foamTex.repeat.set(4, 1);
  const foam = flat(W, 0.42, new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false }), W / 2, 0.03, SHORE);
  foam.receiveShadow = false;
  const waves = [0, 1, 2].map((i) => {
    const m = flat(W, 0.16, new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0, depthWrite: false }), W / 2, 0.028, 1);
    m.receiveShadow = false;
    m.userData.k = i / 3;
    return m;
  });
  col(0, 0, W, SHORE - 0.25); // 물에는 못 들어간다 (발목까지만)

  // ---- 꾸미기 도우미 ----
  const WOOD = '#C9A27A';
  const WOOD_D = '#8A5A3C';
  const leafGeo = new THREE.SphereGeometry(0.5, 10, 6);
  function palm(x, z, s = 1, lean = 0.5) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    stat.add(g);
    let px = 0;
    for (let i = 0; i < 6; i++) {
      px += Math.sin(i * 0.22) * 0.07 * s * lean * 2;
      cyl(g, (0.1 - i * 0.008) * s, (0.115 - i * 0.008) * s, 0.42 * s, px, i * 0.4 * s, 0, i % 2 ? '#A67C52' : '#B88A5C', { seg: 10 });
    }
    const top = new THREE.Group();
    top.position.set(px, 2.42 * s, 0);
    g.add(top);
    for (let i = 0; i < 7; i++) {
      const piv = new THREE.Group();
      piv.rotation.y = (i / 7) * PI * 2 + R() * 0.3;
      top.add(piv);
      const m = new THREE.Mesh(leafGeo, mat(i % 2 ? '#4E9A5B' : '#62B46E'));
      m.scale.set(1.25 * s, 0.07, 0.34 * s);
      m.position.set(0.52 * s, -0.12 * s, 0);
      m.rotation.z = -0.42 - R() * 0.2;
      m.castShadow = true;
      piv.add(m);
    }
    for (const [cx, cz] of [[0.09, 0.05], [-0.07, 0.08], [0.02, -0.1]]) ball(top, 0.085 * s, cx * s, -0.1 * s, cz * s, '#7A5230', { seg: 10 });
    col(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  }
  // 파라솔: 발치 쪽 모래에 꽂고 자리 쪽으로 기울인다 (위에서 볼 때 누운 사람을 가리지 않게)
  function parasol(x, z, color, tilt = 0.3, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.set(tilt, ry, 0, 'YXZ');
    stat.add(g);
    cyl(g, 0.022, 0.022, 1.95, 0, 0, 0, '#F4F1EA', { seg: 8 });
    const tex = canvasTex(192, 8, drawStripes(color));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.86, 0.34, 12, 1, true), texMat(tex, { side: THREE.DoubleSide, roughness: 0.8 }));
    canopy.position.y = 1.95;
    canopy.castShadow = true;
    g.add(canopy);
    ball(g, 0.045, 0, 2.16, 0, color, { seg: 10 });
    col(x - 0.08, z - 0.08, x + 0.08, z + 0.08);
  }
  // 선베드: 앞은 평평하고 뒤는 비스듬히 세운 등받이. 자리 점은 발이 놓이는 곳이고 몸은 등받이에 기댄다
  function sunbed(id, x, z, h, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = h;
    stat.add(g);
    box(g, 0.62, 0.05, 0.74, 0, 0.25, 0.4, WOOD, { r: 0.02 });
    box(g, 0.56, 0.04, 0.7, 0, 0.3, 0.4, color, { r: 0.02 });
    box(g, 0.62, 0.05, 1.16, 0, 0.47, -0.475, WOOD, { r: 0.02, rx: 0.42 });
    box(g, 0.56, 0.04, 1.12, 0, 0.515, -0.455, color, { r: 0.02, rx: 0.42 });
    box(g, 0.4, 0.09, 0.2, 0, 0.67, -0.82, '#FFFDF6', { r: 0.04, rx: 0.42 }); // 베개
    for (const sx of [-0.26, 0.26]) {
      box(g, 0.05, 0.25, 0.05, sx, 0, 0.7, WOOD_D, { r: 0.01 });
      box(g, 0.05, 0.3, 0.05, sx, 0, 0.08, WOOD_D, { r: 0.01 });
      box(g, 0.05, 0.68, 0.05, sx, 0, -0.9, WOOD_D, { r: 0.01 });
    }
    // 눕는 자리 (눕는 자세는 발 쪽이 기준이라 평평한 쪽에 둔다)
    seat(id, x, z, h, 0.5, 'sunbed', { tableY: null });
    const s = Math.sin(h);
    const c = Math.cos(h);
    const pts = [[-0.33, -1.02], [0.33, -1.02], [-0.33, 0.76], [0.33, 0.76]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    col(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])));
  }
  function sideTable(x, z, drink) {
    cyl(stat, 0.2, 0.2, 0.03, x, 0.3, z, '#FFFDF6', { seg: 18 });
    cyl(stat, 0.025, 0.03, 0.3, x, 0, z, WOOD_D, { seg: 8 });
    cyl(stat, 0.045, 0.035, 0.11, x + 0.05, 0.33, z, drink, { seg: 12, mat: { transparent: true, opacity: 0.85 } });
    cyl(stat, 0.006, 0.006, 0.13, x + 0.07, 0.4, z, '#E5484D', { seg: 6 });
    col(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  }
  function chair(x, z, h, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = h;
    stat.add(g);
    box(g, 0.42, 0.05, 0.4, 0, 0.25, 0, color, { r: 0.02 });
    box(g, 0.4, 0.34, 0.05, 0, 0.3, -0.19, color, { r: 0.02, rx: -0.08 });
    for (const [lx, lz] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) box(g, 0.035, 0.25, 0.035, lx, 0, lz, '#F4F1EA', { r: 0.01 });
  }
  function stool(x, z, color) {
    cyl(stat, 0.2, 0.2, 0.06, x, 0.56, z, color, { seg: 20 });
    cyl(stat, 0.03, 0.04, 0.56, x, 0, z, WOOD_D, { seg: 10 });
    cyl(stat, 0.16, 0.18, 0.03, x, 0, z, WOOD_D, { seg: 20 });
  }

  // ---- 선베드 줄: 바다를 보고 눕는다 ----
  const BED_Z = 5.0;
  const BEDS = [
    ['bed1', 1.6, '#F08A6B'],
    ['bed2', 2.9, '#5FB3AA'],
    ['bed3', 4.9, '#F7C948'],
    ['bed4', 6.2, '#7FB6E8'],
    ['boss', 8.2, '#FF8A3D'],
    ['bed5', 9.5, '#E58FB0'],
  ];
  for (const [id, x, c] of BEDS) sunbed(id, x, BED_Z, PI, c);
  [[2.25, '#E5484D'], [5.55, '#3D6FD8'], [8.85, '#FF8A3D']].forEach(([x, c], i) => {
    parasol(x, 3.65, c);
    sideTable(x, 5.25, ['#F7C948', '#7FD8BE', '#F08A6B'][i]);
  });
  // 아이스박스
  box(stat, 0.44, 0.3, 0.3, 10.35, 0, 5.6, '#3D6FD8', { r: 0.04 });
  box(stat, 0.46, 0.07, 0.32, 10.35, 0.3, 5.6, '#FFFDF6', { r: 0.03 });
  col(10.1, 5.42, 10.6, 5.78);

  // ---- 해변 바: 뒤판에 현황판, 앞에 카운터와 높은 의자 ----
  box(stat, 4.9, 2.05, 0.12, 13.2, 0, 3.0, '#B98D63', { r: 0.02 });
  for (let i = 0; i < 7; i++) box(stat, 0.02, 2.0, 0.01, 10.95 + i * 0.75, 0, 3.065, '#9A7350', { r: 0, cast: false });
  for (const px of [10.8, 15.6]) cyl(stat, 0.07, 0.08, 2.4, px, 0, 3.0, WOOD_D, { seg: 10 });
  box(stat, 5.1, 0.07, 0.5, 13.2, 2.05, 3.05, '#E3C58A', { r: 0.03 }); // 짚 차양
  for (let i = 0; i < 10; i++) box(stat, 0.42, 0.16, 0.04, 10.95 + i * 0.5, 1.92, 3.31, i % 2 ? '#D9B56E' : '#E8CE93', { r: 0.02, cast: false });
  // 현황판
  box(stat, 2.7, 1.62, 0.06, 12.35, 0.3, 3.09, '#5A3D29', { r: 0.025, cast: false });
  const boardSurface = plane(
    stat,
    2.5,
    1.42,
    new THREE.MeshStandardMaterial({ map: boardTexture || null, color: boardTexture ? '#FFFFFF' : '#FBFBF8', roughness: 0.45 }),
    12.35,
    1.11,
    3.125,
  );
  boardSurface.userData.keep = true;
  // 서핑 보드와 구명튜브
  const surf = (x, color, stripe, rz) => {
    const g = new THREE.Group();
    g.position.set(x, 0.92, 3.17);
    g.rotation.set(-0.12, 0, rz);
    stat.add(g);
    ball(g, 0.5, 0, 0, 0, color, { s: [0.42, 1.75, 0.07], seg: 16 });
    ball(g, 0.5, 0, 0, 0.012, stripe, { s: [0.09, 1.7, 0.07], seg: 12, cast: false });
  };
  surf(14.35, '#7FD8BE', '#FFFDF6', 0.06);
  surf(14.95, '#FF8A3D', '#FFD15C', -0.05);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 10, 24), mat('#E5484D'));
  ring.position.set(15.38, 1.5, 3.1);
  ring.castShadow = true;
  stat.add(ring);
  // 카운터
  box(stat, 4.5, 0.9, 0.58, 13.2, 0, 3.78, '#F4F1EA', { r: 0.03 });
  box(stat, 4.6, 0.06, 0.68, 13.2, 0.9, 3.78, WOOD, { r: 0.02 });
  for (let i = 0; i < 6; i++) box(stat, 0.02, 0.74, 0.01, 11.2 + i * 0.8, 0.08, 4.075, '#7FD8BE', { r: 0, cast: false });
  // 코코넛 음료, 과일 바구니, 믹서
  [[11.4, '#7A5230'], [13.9, '#7A5230']].forEach(([x, c]) => {
    ball(stat, 0.1, x, 1.05, 3.72, c, { seg: 12 });
    cyl(stat, 0.006, 0.006, 0.16, x + 0.03, 1.12, 3.72, '#FFD15C', { seg: 6 });
  });
  cyl(stat, 0.16, 0.12, 0.08, 12.6, 0.96, 3.66, '#C9A27A', { seg: 14 });
  [['#FFD15C', -0.06], ['#FF8A3D', 0.05], ['#E5484D', 0.0]].forEach(([c, dx], i) => ball(stat, 0.065, 12.6 + dx, 1.07 + (i === 2 ? 0.06 : 0), 3.66 + (i - 1) * 0.04, c, { seg: 10, cast: false }));
  cyl(stat, 0.07, 0.085, 0.24, 15.0, 0.96, 3.66, '#BFE3EE', { seg: 12, mat: { transparent: true, opacity: 0.6 } });
  cyl(stat, 0.09, 0.09, 0.07, 15.0, 0.96, 3.66, '#3A3D42', { seg: 12 });
  col(10.7, 2.85, 15.7, 4.12);
  [11.5, 12.4, 13.3, 14.2, 15.1].forEach((x, i) => {
    stool(x, 4.5, ['#FF8A3D', '#7FD8BE', '#F7C948', '#E58FB0', '#7FB6E8'][i]);
    seat(`bar${i + 1}`, x, 4.5, PI, 0.62, 'chair', { tableY: 0.96, lapZ: 0.6 });
  });
  // 깃발 줄
  for (let i = 0; i < 12; i++) {
    const fx = 10.95 + i * 0.41;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 3), mat(['#E5484D', '#FFD15C', '#3D6FD8', '#3FA66B'][i % 4]));
    flag.position.set(fx, 2.28 - Math.sin((i / 11) * PI) * 0.12, 3.02);
    flag.rotation.set(PI, 0, 0);
    flag.scale.z = 0.2;
    stat.add(flag);
  }

  // ---- 파라솔 테이블 셋: 노트북 펴고 일하는 자리 ----
  const CH = ['#7FD8BE', '#F08A6B', '#F7C948', '#7FB6E8'];
  [[2.6, 9.0, '#3FA66B'], [6.0, 9.5, '#F7C948'], [9.6, 9.0, '#E58FB0']].forEach(([x, z, pc], i) => {
    cyl(stat, 0.5, 0.5, 0.04, x, 0.56, z, '#FFFDF6', { seg: 32 });
    cyl(stat, 0.045, 0.05, 0.56, x, 0, z, WOOD_D, { seg: 10 });
    cyl(stat, 0.24, 0.26, 0.03, x, 0, z, WOOD_D, { seg: 20 });
    if (i % 2) ball(stat, 0.06, x + 0.05, 0.66, z, '#FFD15C', { seg: 10 });
    else cyl(stat, 0.045, 0.035, 0.1, x, 0.6, z + 0.05, '#7FD8BE', { seg: 12, mat: { transparent: true, opacity: 0.85 } });
    col(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    parasol(x, z - 1.75, pc, 0.34);
    const T = String.fromCharCode(65 + i);
    chair(x - 0.8, z, PI / 2, CH[i % 4]);
    chair(x + 0.8, z, -PI / 2, CH[(i + 1) % 4]);
    chair(x, z - 0.8, 0, CH[(i + 2) % 4]);
    chair(x, z + 0.8, PI, CH[(i + 3) % 4]);
    seat(`t${T}w`, x - 0.8, z, PI / 2, 0.3, 'chair', { tableY: 0.6, lapZ: 0.58 });
    seat(`t${T}e`, x + 0.8, z, -PI / 2, 0.3, 'chair', { tableY: 0.6, lapZ: 0.58 });
    seat(`t${T}n`, x, z - 0.8, 0, 0.3, 'chair', { tableY: 0.6, lapZ: 0.58 });
    seat(`t${T}s`, x, z + 0.8, PI, 0.3, 'chair', { tableY: 0.6, lapZ: 0.58 });
  });

  // ---- 나무 데크: 낮은 탁자와 방석 ----
  box(stat, 3.2, 0.08, 2.6, 13.4, 0, 8.3, '#C9A27A', { r: 0.02 });
  for (let i = 0; i < 7; i++) box(stat, 0.015, 0.082, 2.6, 12.0 + i * 0.46, 0, 8.3, '#A9835C', { r: 0, cast: false });
  box(stat, 1.1, 0.05, 0.8, 13.4, 0.3, 8.3, '#FFFDF6', { r: 0.02 });
  for (const lx of [-0.45, 0.45]) for (const lz of [-0.3, 0.3]) box(stat, 0.05, 0.22, 0.05, 13.4 + lx, 0.08, 8.3 + lz, WOOD_D, { r: 0.01 });
  ball(stat, 0.13, 13.4, 0.42, 8.3, '#62B46E', { s: [1, 0.8, 1], seg: 12 }); // 수박 반 통
  ball(stat, 0.115, 13.4, 0.44, 8.3, '#F0626C', { s: [1, 0.55, 1], seg: 12, cast: false });
  col(12.85, 7.9, 13.95, 8.7);
  [[12.35, 8.3, PI / 2, '#F08A6B'], [14.45, 8.3, -PI / 2, '#7FB6E8'], [13.4, 7.35, 0, '#F7C948'], [13.4, 9.25, PI, '#5FB3AA']].forEach(([x, z, h, c], i) => {
    cyl(stat, 0.27, 0.27, 0.09, x, 0.08, z, c, { seg: 20 });
    seat(`deck${i + 1}`, x, z, h, 0.24, 'sofa', { tableY: null });
  });

  // ---- 나가는 길: 나무 길과 이정표 ----
  for (let i = 0; i < 5; i++) box(stat, 0.26, 0.03, 1.1, 14.25 + i * 0.3, 0, 10.9, i % 2 ? '#B98D63' : '#C9A27A', { r: 0.008, cast: false });
  cyl(stat, 0.04, 0.05, 1.5, 15.55, 0, 10.15, WOOD_D, { seg: 8 });
  box(stat, 0.6, 0.18, 0.04, 15.4, 1.2, 10.15, '#FFFDF6', { r: 0.02, ry: 0.5 });
  box(stat, 0.52, 0.16, 0.04, 15.45, 0.95, 10.15, '#7FD8BE', { r: 0.02, ry: -0.4 });
  col(15.4, 10.0, 15.7, 10.3);

  // ---- 야자수, 공, 모래성, 조개 ----
  palm(0.75, 3.55, 1.05, 0.7);
  palm(0.9, 11.2, 1.2, -0.4);
  palm(10.3, 11.35, 1.0, 0.5);
  palm(15.35, 6.3, 1.15, -0.6);
  // 비치볼
  const bb = new THREE.Group();
  bb.position.set(7.3, 0.24, 7.2);
  stat.add(bb);
  ball(bb, 0.24, 0, 0, 0, '#FFFDF6', { seg: 20 });
  ['#E5484D', '#3D6FD8', '#FFD15C'].forEach((c, i) => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.243, 12, 12, (i * 2 * PI) / 3, PI / 3), mat(c));
    w.castShadow = false;
    bb.add(w);
  });
  bb.rotation.set(0.5, 0.3, 0.2);
  col(7.08, 6.98, 7.52, 7.42);
  // 모래성과 양동이
  const SAND = '#E6CC96';
  box(stat, 0.7, 0.16, 0.7, 11.2, 0, 7.0, SAND, { r: 0.03 });
  box(stat, 0.42, 0.2, 0.42, 11.2, 0.16, 7.0, SAND, { r: 0.03 });
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    cyl(stat, 0.08, 0.1, 0.3, 11.2 + dx, 0, 7.0 + dz, SAND, { seg: 10 });
    cyl(stat, 0.0, 0.09, 0.12, 11.2 + dx, 0.3, 7.0 + dz, '#DDBF86', { seg: 10 });
  }
  cyl(stat, 0.008, 0.008, 0.3, 11.2, 0.36, 7.0, WOOD_D, { seg: 6 });
  box(stat, 0.14, 0.09, 0.01, 11.27, 0.56, 7.0, '#E5484D', { r: 0.002, cast: false });
  cyl(stat, 0.1, 0.075, 0.16, 11.85, 0, 7.35, '#3D6FD8', { seg: 12 });
  col(10.8, 6.6, 11.6, 7.4);
  // 조개, 불가사리, 돌
  for (let i = 0; i < 14; i++) {
    const x = 0.6 + R() * 14.8;
    const z = SHORE + 0.25 + R() * 0.8;
    ball(stat, 0.045 + R() * 0.03, x, 0.012, z, ['#FFFDF6', '#F6C6CF', '#F2D8AE'][i % 3], { s: [1, 0.35, 0.8], seg: 8, cast: false });
  }
  for (const [x, z, c] of [[3.9, 3.5, '#F08A6B'], [9.9, 3.45, '#FFB36B']]) {
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 5), mat(c));
    star.position.set(x, 0.014, z);
    star.rotation.y = R() * 3;
    stat.add(star);
  }
  for (const [x, z, s] of [[0.5, 2.6, 0.34], [1.05, 2.35, 0.22], [15.5, 2.5, 0.28]]) ball(stat, s, x, s * 0.35, z, '#9AA1A6', { s: [1.2, 0.7, 1], seg: 10 });
  col(0.1, 2.2, 1.3, 2.9);
  col(15.2, 2.25, 15.85, 2.8);
  // 수건 한 장 (쉬는 에이전트가 서 있는 곳 근처)
  box(stat, 0.7, 0.012, 1.3, 4.0, 0, 7.2, '#7FB6E8', { r: 0.004, cast: false });
  for (let i = 0; i < 4; i++) box(stat, 0.7, 0.013, 0.1, 4.0, 0, 6.7 + i * 0.34, '#FFFDF6', { r: 0.004, cast: false });

  mergeGroup(stat);

  const zones = [
    { id: 'sea', name: '바다', x0: 0, z0: 0, x1: 16, z1: 3.1, desc: '파도가 밀려왔다 나가요.' },
    { id: 'beds', name: '선베드', x0: 0, z0: 3.1, x1: 10.7, z1: 6.3, desc: '파라솔 아래 누워서 쉬는 자리.' },
    { id: 'bar', name: '해변 바', x0: 10.7, z0: 2.8, x1: 16, z1: 5.2, desc: '오늘의 작업 현황판과 시원한 음료.' },
    { id: 'tables', name: '파라솔 테이블', x0: 0, z0: 7.4, x1: 11.4, z1: 12, desc: '노트북 펴고 일하는 그늘 자리.' },
    { id: 'deck', name: '나무 데크', x0: 11.6, z0: 6.9, x1: 16, z1: 9.8, desc: '방석에 앉아 수박 먹는 곳.' },
    { id: 'entry', name: '나가는 길', x0: 13.8, z0: 10.2, x1: 16, z1: 12, desc: '다른 맵으로 가는 길.' },
  ];
  const spots = [
    { id: 'board', kind: 'board', x: 12.35, z: 5.2, r: 1.2, label: '현황판 보기' },
    { id: 'door', kind: 'door', x: 15.25, z: 10.9, r: 1.15, label: '나가기' },
  ];

  let t = 0;
  function update(dt) {
    t += dt;
    // 파도: 먼 데서 생겨 물가로 밀려오며 옅어진다
    for (const w of waves) {
      const p = (t * 0.11 + w.userData.k) % 1;
      w.position.z = 0.25 + p * (SHORE - 0.45);
      w.material.opacity = Math.sin(p * PI) * 0.6;
    }
    foam.position.z = SHORE + Math.sin(t * 0.7) * 0.13;
    foam.material.opacity = 0.75 + Math.sin(t * 0.7 + 1) * 0.2;
    foamTex.offset.x = t * 0.012;
  }

  return {
    root,
    W,
    D,
    colliders,
    seats,
    spots,
    zones,
    walls: [],
    boardSurface,
    spawn: { x: 14.6, z: 10.9, h: -PI / 2 },
    update,
    setCut: () => {},
    toggleFridge: () => false,
    toggleTV: () => false,
  };
}
