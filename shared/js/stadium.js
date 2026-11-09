// 축구장 맵: 하얀 관중석이 둘러싼 그라운드, 기자석, 벤치, 감독석, 전광판.
// 작업실(room.js)과 같은 크기(16 × 12)와 같은 모양의 결과를 돌려준다.
// 관중석이 벽 노릇을 해서, 카메라 쪽 관중석은 낮아진다.
import * as THREE from 'three';
import { box, cyl, ball, plane, glowMat, mergeGroup } from './room.js';
import { canvasTex, rng, FONT_HAND, FONT_BODY } from './tex.js';
import { damp } from './util.js';

const W = 16;
const D = 12;
const PI = Math.PI;
// 그라운드 (터치라인 안쪽)
const P = { x0: 2.0, z0: 3.0, x1: 14.0, z1: 9.0 };
const PX = 64; // 바닥 그림: 1m에 64px

function drawPitch(g, w, h) {
  // 관중석 아래는 콘크리트, 안쪽은 잔디 줄무늬
  g.fillStyle = '#B9BDC2';
  g.fillRect(0, 0, w, h);
  const inX0 = 1.3 * PX;
  const inZ0 = 1.3 * PX;
  const inX1 = 14.7 * PX;
  const inZ1 = 10.9 * PX;
  for (let i = 0; i * PX < inX1; i++) {
    g.fillStyle = i % 2 ? '#4C9A50' : '#43904A';
    const x = Math.max(inX0, i * PX);
    g.fillRect(x, inZ0, Math.min(inX1, (i + 1) * PX) - x, inZ1 - inZ0);
  }
  // 잔디 결
  g.globalAlpha = 0.07;
  const R = rng(7);
  for (let k = 0; k < 2200; k++) {
    g.fillStyle = k % 2 ? '#FFFFFF' : '#1E4D22';
    g.fillRect(inX0 + R() * (inX1 - inX0), inZ0 + R() * (inZ1 - inZ0), 2, 5);
  }
  g.globalAlpha = 1;
  // 흰 선
  const L = (u) => u * PX;
  g.strokeStyle = '#F4F7F2';
  g.lineWidth = 4;
  g.strokeRect(L(P.x0), L(P.z0), L(P.x1 - P.x0), L(P.z1 - P.z0));
  const cx = (P.x0 + P.x1) / 2;
  const cz = (P.z0 + P.z1) / 2;
  g.beginPath();
  g.moveTo(L(cx), L(P.z0));
  g.lineTo(L(cx), L(P.z1));
  g.stroke();
  g.beginPath();
  g.arc(L(cx), L(cz), L(1.0), 0, PI * 2);
  g.stroke();
  g.fillStyle = '#F4F7F2';
  g.beginPath();
  g.arc(L(cx), L(cz), 5, 0, PI * 2);
  g.fill();
  for (const side of [-1, 1]) {
    const gx = side < 0 ? P.x0 : P.x1;
    const inward = -side;
    // 페널티 박스, 골 박스, 페널티 점, 아크
    g.strokeRect(L(Math.min(gx, gx + inward * 1.6)), L(cz - 1.8), L(1.6), L(3.6));
    g.strokeRect(L(Math.min(gx, gx + inward * 0.55)), L(cz - 0.85), L(0.55), L(1.7));
    const px = gx + inward * 1.1;
    g.beginPath();
    g.arc(L(px), L(cz), 4, 0, PI * 2);
    g.fill();
    g.beginPath();
    const a = Math.acos(0.5 / 0.9);
    if (side < 0) g.arc(L(px), L(cz), L(0.9), -a, a);
    else g.arc(L(px), L(cz), L(0.9), PI - a, PI + a);
    g.stroke();
  }
  // 코너 아크
  for (const [x, z, s, e] of [
    [P.x0, P.z0, 0, PI / 2],
    [P.x1, P.z0, PI / 2, PI],
    [P.x1, P.z1, PI, PI * 1.5],
    [P.x0, P.z1, PI * 1.5, PI * 2],
  ]) {
    g.beginPath();
    g.arc(L(x), L(z), L(0.2), s, e);
    g.stroke();
  }
}
// 광고판(LED): 옆으로 흘러가는 글자
function drawLed(g, w, h) {
  g.fillStyle = '#10131A';
  g.fillRect(0, 0, w, h);
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(h * 0.56)}px ${FONT_BODY}`;
  const words = [
    ['AGENT OFFICE', '#FFFFFF'],
    ['끝나면 보고하러 와요', '#FFB36B'],
    ['오늘도 출근 +1', '#9EE6A8'],
    ['AGENT FC', '#C9B8FF'],
  ];
  let x = 24;
  let i = 0;
  while (x < w) {
    const [t, c] = words[i++ % words.length];
    g.fillStyle = c;
    g.fillText(t, x, h / 2 + 2);
    x += g.measureText(t).width + 70;
  }
}
// 관중석 뒤 띠 (반짝이는 은색 철판 줄)
function drawRibbon(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#F4F6F8');
  grd.addColorStop(0.5, '#C3C9D0');
  grd.addColorStop(1, '#E9ECEF');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70, 80, 92, .35)';
  g.lineWidth = 2;
  for (let y = 6; y < h; y += 12) {
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 90) * 3);
    g.stroke();
  }
}
function drawTunnelSign(g, w, h) {
  g.fillStyle = '#1C1F26';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#FFFFFF';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `48px ${FONT_HAND}`;
  g.fillText('선수 입장', w / 2, h / 2 + 2);
}

export function buildStadium(scene, { boardTexture } = {}) {
  const root = new THREE.Group();
  root.name = 'stadium';
  scene.add(root);
  const stat = new THREE.Group();
  root.add(stat);
  const colliders = [];
  const seats = [];
  const walls = [];
  const col = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const seat = (id, x, z, h, y, kind, extra = {}) => seats.push({ id, x, z, h, y, kind, ...extra });

  // 받침대와 바닥 (잔디와 선은 한 장의 그림)
  box(stat, W + 0.8, 0.5, D + 0.8, W / 2, -0.51, D / 2, '#3A3F47', { r: 0.1, cast: false });
  const floorTex = canvasTex(W * PX, D * PX, drawPitch);
  floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 }));
  floor.rotation.x = -PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- 관중석: 계단식 단 + 하얀 좌석 줄 + 뒤쪽 은색 띠 ----
  // dir: 그라운드에서 바깥쪽으로 올라가는 방향, from/to: 관중석이 놓인 길이 구간
  const ribbonTex = canvasTex(512, 64, drawRibbon);
  ribbonTex.wrapS = THREE.RepeatWrapping;
  ribbonTex.repeat.set(6, 1);
  const ribbonMat = new THREE.MeshStandardMaterial({ map: ribbonTex, roughness: 0.35, metalness: 0.55 });
  function stand(name, side, depth, rows, from, to, inner, gaps = []) {
    const g = new THREE.Group();
    root.add(g);
    const body = new THREE.Group();
    const decor = new THREE.Group();
    g.add(body, decor);
    const w = { name, group: g, body, decor, inner, cut: 0, target: 0 };
    walls.push(w);
    const step = depth / rows;
    const len = to - from;
    // 길이 방향 구간 (틈 빼고)
    const spans = [];
    let s0 = from;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > s0) spans.push([s0, a]);
      s0 = Math.max(s0, b);
    }
    if (s0 < to) spans.push([s0, to]);
    // 바깥 끝(벽 쪽) 좌표
    const edge = side === 'north' || side === 'west' ? 0 : side === 'south' ? D : W;
    const out = side === 'north' || side === 'west' ? -1 : 1; // 바깥으로 갈수록 좌표가 커지면 1
    for (const [a, b] of spans) {
      const mid = (a + b) / 2;
      const l = b - a;
      for (let r = 0; r < rows; r++) {
        const hTop = 0.28 * (r + 1);
        // r=0이 그라운드 쪽, 바깥으로 갈수록 높다
        const c = edge - out * (depth - step * (r + 0.5));
        const along = side === 'north' || side === 'south';
        box(body, along ? l : step, hTop, along ? step : l, along ? mid : c, 0, along ? c : mid, r % 2 ? '#C7CCD2' : '#D2D6DB', { r: 0, cast: r === rows - 1 });
        // 좌석: 단 뒤쪽에 하얀 등받이를 줄지어
        const back = c + out * (step / 2 - 0.07);
        const n = Math.floor(l / 0.22);
        for (let k = 0; k < n; k++) {
          const p = a + (k + 0.5) * (l / n);
          const accent = (k + r * 3) % 23 === 0;
          const col = accent ? '#5B4A9E' : '#F6F6F4';
          if (along) box(decor, 0.16, 0.13, 0.05, p, hTop, back, col, { r: 0, cast: false });
          else box(decor, 0.05, 0.13, 0.16, back, hTop, p, col, { r: 0, cast: false });
        }
      }
      // 뒤쪽 벽과 은색 띠
      const along = side === 'north' || side === 'south';
      const topH = 0.28 * rows + 0.55;
      box(body, along ? l : 0.06, topH, along ? 0.06 : l, along ? mid : edge - out * 0.03, 0, along ? edge - out * 0.03 : mid, '#E4E7EA', { r: 0, cast: false });
      const rb = new THREE.Mesh(new THREE.BoxGeometry(along ? l : 0.04, 0.42, along ? 0.04 : l), ribbonMat);
      rb.position.set(along ? mid : edge - out * 0.07, 0.28 * rows + 0.3, along ? edge - out * 0.07 : mid);
      decor.add(rb);
      rb.userData.keep = true;
      // 지붕 끝 조명 띠
      const led = box(decor, along ? l : 0.05, 0.04, along ? 0.05 : l, along ? mid : edge - out * 0.1, topH - 0.02, along ? edge - out * 0.1 : mid, '#FFFFFF', {
        r: 0,
        cast: false,
        mat: { emissive: '#FFFFFF', emissiveIntensity: 0.9 },
      });
      led.userData.keep = true;
    }
    return w;
  }
  const north = stand('north', 'north', 1.3, 4, 0, W, { x: 0, z: 1 });
  const south = stand('south', 'south', 1.1, 3, 0, W, { x: 0, z: -1 }, [[12.9, 14.3]]);
  stand('west', 'west', 1.3, 4, 1.3, 10.9, { x: 1, z: 0 });
  stand('east', 'east', 1.3, 4, 1.3, 10.9, { x: -1, z: 0 });
  col(0, 0, W, 1.3);
  col(0, 0, 1.3, D);
  col(14.7, 0, W, D);
  col(0, 10.9, 12.9, D);
  col(14.3, 10.9, W, D);
  col(12.9, 11.55, 14.3, D);

  // 북쪽 관중석 가운데: 전광판 (오늘의 작업 현황)
  box(north.decor, 2.76, 1.78, 0.12, 8, 1.15, 0.32, '#16191F', { r: 0.03, cast: false });
  const boardSurface = plane(
    north.decor,
    2.5,
    1.56,
    new THREE.MeshStandardMaterial({ map: boardTexture || null, color: boardTexture ? '#FFFFFF' : '#FBFBF8', roughness: 0.45, emissive: '#FFFFFF', emissiveIntensity: 0.12, emissiveMap: boardTexture || null }),
    8,
    2.04,
    0.385,
  );
  boardSurface.userData.keep = true;
  for (const lx of [6.9, 9.1]) box(north.decor, 0.08, 1.15, 0.08, lx, 0, 0.3, '#2A2E36', { r: 0.01, cast: false });

  // 남쪽 관중석 가운데: 귀빈석 유리
  box(south.decor, 2.4, 0.5, 0.06, 8, 0.86, 11.7, '#9FC3E0', { r: 0.01, cast: false, mat: { transparent: true, opacity: 0.55, roughness: 0.15 } });
  // 선수 입장 터널
  box(south.body, 1.4, 1.25, 0.6, 13.6, 0, 11.7, '#2A2E36', { r: 0, cast: false });
  box(south.body, 1.1, 1.0, 0.1, 13.6, 0, 11.38, '#0D0F13', { r: 0, cast: false });
  const tSign = canvasTex(256, 64, drawTunnelSign);
  plane(south.decor, 1.0, 0.25, glowMat(tSign), 13.6, 1.12, 11.36, PI).userData.keep = true;

  // ---- 골대 ----
  const netMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.32, roughness: 0.9, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const gx = side < 0 ? P.x0 : P.x1;
    const back = gx + side * 0.5;
    const cz = (P.z0 + P.z1) / 2;
    for (const z of [cz - 0.8, cz + 0.8]) cyl(stat, 0.035, 0.035, 0.72, gx, 0, z, '#FFFFFF', { seg: 10 });
    cyl(stat, 0.035, 0.035, 1.6, gx, 0.72, cz, '#FFFFFF', { seg: 10, rx: PI / 2 });
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 1.6), netMat);
    net.position.set((gx + back) / 2, 0.36, cz);
    net.userData.keep = true;
    stat.add(net);
    col(Math.min(gx, back) - 0.05, cz - 0.85, Math.max(gx, back) + 0.05, cz + 0.85);
  }
  // 코너 깃발
  for (const [x, z] of [[P.x0, P.z0], [P.x1, P.z0], [P.x0, P.z1], [P.x1, P.z1]]) {
    cyl(stat, 0.012, 0.012, 0.6, x, 0, z, '#F2F2F2', { seg: 6, cast: false });
    box(stat, 0.01, 0.12, 0.16, x, 0.46, z + 0.08, '#E8C547', { r: 0, cast: false });
  }
  // 센터 서클 위 공
  ball(stat, 0.11, 8.0, 0.11, 6.0, '#FFFFFF');
  for (const [dx, dz] of [[0.06, 0.03], [-0.05, 0.05], [0.0, -0.07]]) ball(stat, 0.035, 8.0 + dx, 0.17, 6.0 + dz, '#222428', { cast: false });

  // ---- 광고판 (북쪽 터치라인, 가운데는 통로) ----
  const ledTex = canvasTex(1024, 64, drawLed);
  ledTex.wrapS = THREE.RepeatWrapping;
  const ledMat = glowMat(ledTex);
  for (const [a, b] of [[2.0, 7.1], [8.9, 14.0]]) {
    box(stat, b - a, 0.26, 0.1, (a + b) / 2, 0, 2.75, '#1A1D24', { r: 0.01 });
    const m = plane(stat, b - a - 0.04, 0.2, ledMat, (a + b) / 2, 0.14, 2.805);
    m.userData.keep = true;
    col(a, 2.7, b, 2.8);
  }

  // ---- 의자 도우미 ----
  function chair(x, z, h, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = h;
    stat.add(g);
    box(g, 0.42, 0.05, 0.4, 0, 0.25, 0, color, { r: 0.02 });
    box(g, 0.4, 0.4, 0.05, 0, 0.3, -0.19, color, { r: 0.02, rx: -0.08 });
    for (const [lx, lz] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) box(g, 0.035, 0.25, 0.035, lx, 0, lz, '#2A2E36', { r: 0.01 });
  }
  // 앞판은 앉는 사람 맞은편에 (panelZ)
  function desk(x0, x1, z0, z1, color = '#E9EBEE', panelZ = z1 - 0.04) {
    box(stat, x1 - x0, 0.05, z1 - z0, (x0 + x1) / 2, 0.55, (z0 + z1) / 2, color, { r: 0.015 });
    box(stat, x1 - x0 - 0.06, 0.5, 0.04, (x0 + x1) / 2, 0.05, panelZ, '#5C6470', { r: 0.01 });
    for (const lx of [x0 + 0.05, x1 - 0.05]) box(stat, 0.05, 0.55, z1 - z0 - 0.06, lx, 0, (z0 + z1) / 2, '#5C6470', { r: 0.01 });
    col(x0, z0, x1, z1);
  }

  // ---- 기자석 (북쪽): 그라운드를 보며 노트북 ----
  desk(2.5, 7.1, 2.25, 2.55);
  desk(8.9, 13.5, 2.25, 2.55);
  [3.0, 4.2, 5.4, 6.6, 9.4, 10.6, 11.8, 13.0].forEach((x, i) => {
    chair(x, 1.95, 0, '#3B4250');
    seat(`pr${i + 1}`, x, 1.95, 0, 0.3, 'chair', { tableY: 0.6, lapZ: 0.45 });
  });

  // ---- 벤치 (남쪽): 지붕 있는 더그아웃 둘 + 가운데 감독석 ----
  const roofMat = { transparent: true, opacity: 0.28, roughness: 0.2 };
  for (const [x0, x1, xs, pre] of [
    [3.6, 6.8, [4.0, 4.8, 5.6, 6.4], 'b'],
    [9.2, 12.4, [9.6, 10.4, 11.2, 12.0], 'b'],
  ]) {
    desk(x0, x1, 9.35, 9.65, '#F2F3F5', 9.39);
    box(stat, x1 - x0 + 0.2, 0.04, 1.5, (x0 + x1) / 2, 1.25, 10.1, '#BFD6EA', { r: 0.02, cast: false, mat: roofMat });
    box(stat, x1 - x0 + 0.2, 1.25, 0.04, (x0 + x1) / 2, 0, 10.84, '#BFD6EA', { r: 0.01, cast: false, mat: roofMat });
    for (const sx of [x0 - 0.1, x1 + 0.1]) box(stat, 0.04, 1.25, 1.5, sx, 0, 10.1, '#BFD6EA', { r: 0.01, cast: false, mat: roofMat });
    xs.forEach((x, i) => {
      chair(x, 10.0, PI, '#2B2F3A');
      const n = pre === 'b' && x0 > 8 ? i + 5 : i + 1;
      seat(`b${n}`, x, 10.0, PI, 0.3, 'chair', { tableY: 0.6, lapZ: 0.45 });
    });
    // 물병
    for (let k = 0; k < 3; k++) cyl(stat, 0.03, 0.03, 0.14, x0 + 0.5 + k * 0.9, 0.6, 9.45, '#7FC4F0', { seg: 8, cast: false });
  }
  // 감독석: 작은 책상 + 작전판
  desk(7.6, 8.4, 9.35, 9.65, '#F2F3F5', 9.39);
  chair(8.0, 10.0, PI, '#5B4A9E');
  seat('boss', 8.0, 10.0, PI, 0.3, 'chair', { tableY: 0.6, lapZ: 0.45 });
  box(stat, 0.5, 0.36, 0.03, 8.75, 0.7, 9.9, '#FFFFFF', { r: 0.01 });
  for (const lx of [8.55, 8.95]) box(stat, 0.03, 0.72, 0.03, lx, 0, 9.92, '#5C6470', { r: 0.005 });
  ball(stat, 0.025, 8.68, 0.92, 9.88, '#3D6FD8', { cast: false });
  ball(stat, 0.025, 8.84, 0.84, 9.88, '#E5484D', { cast: false });
  col(8.5, 9.85, 9.0, 9.98);

  mergeGroup(stat);
  for (const w of walls) {
    mergeGroup(w.body);
    mergeGroup(w.decor);
  }

  const zones = [
    { id: 'pitch', name: '그라운드', x0: P.x0, z0: P.z0, x1: P.x1, z1: P.z1, desc: '쉬는 에이전트들이 나와서 몸을 풀어요.' },
    { id: 'press', name: '기자석', x0: 1.3, z0: 1.3, x1: 14.7, z1: P.z0, desc: '그라운드를 보며 노트북을 펴는 자리예요.' },
    { id: 'bench', name: '벤치', x0: 1.3, z0: P.z1, x1: 12.9, z1: 10.9, desc: '감독석 옆 벤치에서도 일해요.' },
    { id: 'tunnel', name: '선수 입장 터널', x0: 12.9, z0: P.z1, x1: 14.7, z1: D, desc: '에이전트가 여기로 출근해요.' },
  ];
  const spots = [
    { id: 'board', kind: 'board', x: 8.0, z: 2.0, r: 1.6, label: '전광판 보기' },
    { id: 'door', kind: 'door', x: 13.6, z: 11.05, r: 1.15, label: '나가기' },
  ];

  function update(dt) {
    for (const w of walls) {
      w.cut = damp(w.cut, w.target, 9, dt);
      w.body.scale.y = 1 - 0.95 * w.cut;
      w.decor.visible = w.cut < 0.45;
    }
    ledTex.offset.x = (ledTex.offset.x + dt * 0.04) % 1; // 광고판 글자가 천천히 흐른다
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
    spawn: { x: 13.6, z: 10.6, h: PI },
    update,
    setCut,
    toggleFridge: () => false,
    toggleTV: () => false,
  };
}
