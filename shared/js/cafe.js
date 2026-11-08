// 카페 맵: 창가 바, 바리스타 카운터, 2인 테이블, 큰 테이블, 소파 라운지.
// 작업실(room.js)과 같은 크기(16 × 12)와 같은 모양의 결과를 돌려준다.
import * as THREE from 'three';
import { mat, box, cyl, ball, plane, texMat, glowMat, mergeGroup, drawSky } from './room.js';
import { canvasTex, rng, FONT_HAND } from './tex.js';
import { damp } from './util.js';

const W = 16;
const D = 12;
const WALL_H = 2.6;
const PI = Math.PI;

function drawPlanks(g, w, h) {
  const R = rng(21);
  const rows = 8;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -R() * 200;
    while (x < w) {
      const len = 150 + R() * 230;
      const t = Math.floor(R() * 26);
      g.fillStyle = `rgb(${196 + t}, ${158 + t}, ${112 + t})`;
      g.fillRect(x, r * rh, len, rh);
      g.strokeStyle = 'rgba(110,70,35,.13)';
      g.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const yy = r * rh + 8 + R() * (rh - 16);
        g.beginPath();
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + 4, x + len * 0.6, yy - 4, x + len, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(80,50,25,.3)';
      g.fillRect(x, r * rh, 3, rh);
      x += len;
    }
    g.fillStyle = 'rgba(70,45,20,.35)';
    g.fillRect(0, r * rh, w, 2);
  }
}
function drawBrick(g, w, h) {
  g.fillStyle = '#DCD2C6';
  g.fillRect(0, 0, w, h);
  const R = rng(5);
  const bw = 52;
  const bh = 20;
  for (let y = 0, row = 0; y < h; y += bh, row++)
    for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
      const t = R();
      g.fillStyle = t < 0.33 ? '#B9694C' : t < 0.66 ? '#AA5C42' : '#C47A5C';
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fillRect(x + 2, y + 2, bw - 4, 3);
    }
}
function drawCafeSign(g, w, h) {
  g.fillStyle = '#2A2420';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#FFB36B';
  g.lineWidth = 6;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#FF8A3D';
  g.shadowBlur = 18;
  g.fillStyle = '#FFE2BD';
  g.font = `64px ${FONT_HAND}`;
  g.fillText('coffee & code ☕', w / 2, h / 2 + 4);
}
function drawBeans(g, w, h) {
  g.fillStyle = '#C9A57B';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#5A3A24';
  g.font = `bold 40px ${FONT_HAND}`;
  g.textAlign = 'center';
  g.fillText('BEANS', w / 2, h * 0.55);
}

export function buildCafe(scene, { boardTexture } = {}) {
  const root = new THREE.Group();
  root.name = 'cafe';
  scene.add(root);
  const stat = new THREE.Group();
  root.add(stat);
  const R = rng(4242);
  const colliders = [];
  const seats = [];
  const walls = [];
  const col = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const seat = (id, x, z, h, y, kind, extra = {}) => seats.push({ id, x, z, h, y, kind, ...extra });

  // 받침대와 원목 바닥
  box(stat, W + 0.8, 0.5, D + 0.8, W / 2, -0.51, D / 2, '#4A3626', { r: 0.1, cast: false });
  const floorTex = canvasTex(512, 512, drawPlanks);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- 벽: 위는 회반죽, 아래는 짙은 나무 ----
  function wall(name, cx, cz, len, alongX, inner) {
    const g = new THREE.Group();
    root.add(g);
    const body = new THREE.Group();
    const decor = new THREE.Group();
    g.add(body, decor);
    const t = 0.2;
    box(body, alongX ? len : t, WALL_H, alongX ? t : len, cx - (inner.x * t) / 2, 0, cz - (inner.z * t) / 2, '#F3E7D6', { r: 0.02, cast: false });
    const ix = (d) => cx + inner.x * d;
    const iz = (d) => cz + inner.z * d;
    const L = len - 0.02;
    box(body, alongX ? L : 0.03, 0.95, alongX ? 0.03 : L, ix(0.015), 0, iz(0.015), '#6E4B33', { r: 0.008, cast: false });
    box(body, alongX ? L : 0.05, 0.05, alongX ? 0.05 : L, ix(0.025), 0.93, iz(0.025), '#5A3D29', { r: 0.008, cast: false });
    const w = { name, group: g, body, decor, inner, cut: 0, target: 0 };
    walls.push(w);
    return w;
  }
  const north = wall('north', W / 2, 0, W + 0.4, true, { x: 0, z: 1 });
  const south = wall('south', W / 2, D, W + 0.4, true, { x: 0, z: -1 });
  wall('west', 0, D / 2, D, false, { x: 1, z: 0 });
  const east = wall('east', W, D / 2, D, false, { x: -1, z: 0 });

  // 북쪽 벽: 벽돌, 창문, 간판, 현황판, 선반
  const brickTex = canvasTex(512, 256, drawBrick);
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
  brickTex.repeat.set(W / 4, 1);
  plane(north.decor, W, 1.62, texMat(brickTex, { roughness: 0.95 }), W / 2, 1.78, 0.012).userData.keep = true;
  const skyTex = canvasTex(512, 256, (g, w, h) => drawSky(g, w, h, new Date().getHours()));
  const skyMat = glowMat(skyTex);
  for (const wx of [1.9, 4.75]) {
    box(north.decor, 2.5, 1.25, 0.08, wx, 0.92, 0.04, '#4A3222', { r: 0.02, cast: false });
    plane(north.decor, 2.34, 1.1, skyMat, wx, 1.545, 0.084).userData.keep = true;
    box(north.decor, 0.05, 1.1, 0.03, wx, 0.99, 0.095, '#4A3222', { r: 0.01, cast: false });
  }
  const signTex = canvasTex(1024, 160, drawCafeSign);
  plane(north.decor, 3.0, 0.42, glowMat(signTex), 3.32, 2.36, 0.03).userData.keep = true;
  // 현황판(칠판 틀)
  box(north.decor, 2.7, 1.75, 0.07, 8.4, 0.56, 0.035, '#3B2A20', { r: 0.025, cast: false });
  const boardSurface = plane(
    north.decor,
    2.48,
    1.55,
    new THREE.MeshStandardMaterial({ map: boardTexture || null, color: boardTexture ? '#FFFFFF' : '#FBFBF8', roughness: 0.45 }),
    8.4,
    1.435,
    0.074,
  );
  boardSurface.userData.keep = true;
  // 카운터 위 선반과 원두 봉투
  const beanTex = canvasTex(128, 128, drawBeans);
  for (const sy of [1.5, 1.95]) {
    box(north.decor, 4.6, 0.04, 0.26, 13.1, sy, 0.14, '#6E4B33', { r: 0.008, cast: false });
    for (let i = 0; i < 7; i++) {
      const bx = 11.2 + i * 0.62 + (R() - 0.5) * 0.1;
      if (sy > 1.6 && i % 2) {
        cyl(north.decor, 0.06, 0.05, 0.12, bx, sy + 0.04, 0.14, ['#FFFFFF', '#F3E3C3', '#2A2420'][i % 3], { cast: false, seg: 12 });
      } else {
        const bag = box(north.decor, 0.2, 0.28, 0.12, bx, sy + 0.04, 0.15, '#B98D63', { r: 0.02, cast: false });
        bag.material = texMat(beanTex);
        bag.userData.keep = true;
      }
    }
  }

  // 동쪽 벽: 문
  box(east.decor, 0.06, 2.16, 1.3, W - 0.03, 0, 10.9, '#4A3222', { r: 0.01, cast: false });
  box(east.decor, 0.07, 2.06, 1.1, W - 0.05, 0, 10.9, '#8A5A3C', { r: 0.015, cast: false });
  box(east.decor, 0.02, 1.0, 0.6, W - 0.09, 0.8, 10.9, '#BFD9EA', { r: 0.005, cast: false });
  cyl(east.decor, 0.025, 0.025, 0.16, W - 0.12, 0.98, 10.48, '#D9B25C', { rx: PI / 2, cast: false });
  // 남쪽 벽: 액자 셋
  ['#E07A5F', '#81B29A', '#3D5A80'].forEach((c, i) => {
    box(south.decor, 0.7, 0.9, 0.04, 3.2 + i * 1.1, 1.2, D - 0.02, '#3B2A20', { r: 0.01, cast: false });
    box(south.decor, 0.56, 0.74, 0.02, 3.2 + i * 1.1, 1.28, D - 0.045, c, { r: 0.005, cast: false });
  });

  // ---- 가구 도우미 ----
  function chair(x, z, h, color, stool = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = h;
    stat.add(g);
    if (stool) {
      cyl(g, 0.2, 0.2, 0.06, 0, 0.56, 0, color, { seg: 20 });
      cyl(g, 0.03, 0.04, 0.56, 0, 0, 0, '#3A3D42', { seg: 10 });
      cyl(g, 0.16, 0.18, 0.03, 0, 0, 0, '#3A3D42', { seg: 20 });
      cyl(g, 0.14, 0.14, 0.02, 0, 0.22, 0, '#3A3D42', { seg: 20 });
      return;
    }
    box(g, 0.42, 0.05, 0.4, 0, 0.25, 0, color, { r: 0.02 });
    box(g, 0.4, 0.34, 0.05, 0, 0.3, -0.19, color, { r: 0.02, rx: -0.08 });
    for (const [lx, lz] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) box(g, 0.035, 0.25, 0.035, lx, 0, lz, '#3B2A20', { r: 0.01 });
  }
  function plant(x, z, s) {
    cyl(stat, 0.16 * s, 0.12 * s, 0.26 * s, x, 0, z, '#C46A4A');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + R();
      const r = 0.12 * s * R();
      ball(stat, 0.13 * s, x + Math.cos(a) * r, 0.36 * s + R() * 0.45 * s, z + Math.sin(a) * r, i % 2 ? '#4E9A5B' : '#62B46E', { s: [1, 1.35, 1] });
    }
  }
  const CHAIRS = ['#3B2A20', '#2F6E5E', '#C46A4A', '#3B2A20'];

  // ---- 창가 바 + 높은 의자 ----
  box(stat, 5.8, 0.05, 0.5, 3.4, 0.9, 0.37, '#C9A27A', { r: 0.015 });
  for (const lx of [0.7, 3.4, 6.1]) box(stat, 0.05, 0.9, 0.05, lx, 0, 0.5, '#3B2A20', { r: 0.01 });
  cyl(stat, 0.06, 0.05, 0.09, 0.85, 0.95, 0.35, '#FFFFFF', { seg: 12 });
  ball(stat, 0.07, 5.95, 1.02, 0.34, '#62B46E', { s: [1, 1.4, 1] });
  cyl(stat, 0.06, 0.05, 0.08, 5.95, 0.95, 0.34, '#C46A4A', { seg: 12 });
  col(0.5, 0, 6.3, 0.64);
  [1.1, 2.2, 3.3, 4.4, 5.5].forEach((x, i) => {
    chair(x, 1.0, PI, '#2F6E5E', true);
    seat(`bar${i + 1}`, x, 1.0, PI, 0.62, 'chair', { tableY: 0.95, lapZ: 0.52 });
  });

  // ---- 바리스타 카운터 ----
  {
    box(stat, 5.0, 0.9, 0.86, 13.1, 0, 0.56, '#6E4B33', { r: 0.02 });
    box(stat, 5.08, 0.06, 0.94, 13.1, 0.9, 0.56, '#ECE6DC', { r: 0.02 });
    for (let i = 0; i < 6; i++) box(stat, 0.02, 0.7, 0.01, 10.95 + i * 0.83, 0.1, 1.0, '#5A3D29', { r: 0, cast: false });
    // 에스프레소 머신
    box(stat, 0.66, 0.44, 0.44, 14.65, 0.96, 0.42, '#C9CDD2', { r: 0.04, mat: { metalness: 0.5, roughness: 0.35 } });
    box(stat, 0.6, 0.06, 0.2, 14.65, 0.96, 0.68, '#3A3D42', { r: 0.01 });
    for (const gx of [14.5, 14.8]) cyl(stat, 0.04, 0.04, 0.08, gx, 1.1, 0.66, '#3A3D42', { seg: 10 });
    for (let i = 0; i < 4; i++) cyl(stat, 0.04, 0.035, 0.06, 14.42 + i * 0.15, 1.4, 0.4, '#FFFFFF', { seg: 10 });
    // 그라인더
    cyl(stat, 0.09, 0.1, 0.22, 13.95, 0.96, 0.4, '#2A2420', { seg: 14 });
    cyl(stat, 0.1, 0.05, 0.16, 13.95, 1.18, 0.4, '#5A3A24', { seg: 14, mat: { transparent: true, opacity: 0.85 } });
    // 빵 진열장
    box(stat, 0.95, 0.36, 0.5, 12.2, 0.96, 0.5, '#FFFFFF', { r: 0.02, mat: { transparent: true, opacity: 0.28, roughness: 0.1 } });
    for (let i = 0; i < 6; i++)
      ball(stat, 0.07, 11.85 + (i % 3) * 0.33, 1.03 + Math.floor(i / 3) * 0.14, 0.5 + ((i % 2) - 0.5) * 0.12, ['#E8B36A', '#D98F4E', '#F2D0A4'][i % 3], {
        s: [1.3, 0.7, 1],
        cast: false,
      });
    // 계산대, 팁 통, 시럽
    box(stat, 0.32, 0.04, 0.24, 11.15, 1.0, 0.5, '#2F3237', { r: 0.01, rx: -0.4 });
    cyl(stat, 0.07, 0.07, 0.16, 13.25, 0.96, 0.75, '#FFFFFF', { seg: 12, mat: { transparent: true, opacity: 0.4 } });
    ['#B5523A', '#E0A83E', '#6E4B33'].forEach((c, i) => cyl(stat, 0.035, 0.035, 0.24, 13.5 + i * 0.09, 0.96, 0.3, c, { seg: 8 }));
    col(10.6, 0, 15.6, 1.02);
    [11.1, 12.1, 13.1, 14.1, 15.1].forEach((x, i) => {
      chair(x, 1.42, PI, '#3B2A20', true);
      seat(`cnt${i + 1}`, x, 1.42, PI, 0.62, 'chair', { tableY: 0.96, lapZ: 0.6 });
    });
  }

  // ---- 2인 원형 테이블 여섯 개 ----
  [[2.0, 3.6], [4.8, 3.6], [2.0, 6.3], [4.8, 6.3], [2.0, 9.0], [4.8, 9.0]].forEach(([x, z], i) => {
    cyl(stat, 0.42, 0.42, 0.04, x, 0.56, z, '#F1EDE6', { seg: 32 });
    cyl(stat, 0.045, 0.05, 0.56, x, 0, z, '#3A3D42', { seg: 10 });
    cyl(stat, 0.22, 0.24, 0.03, x, 0, z, '#3A3D42', { seg: 20 });
    if (i % 2) cyl(stat, 0.045, 0.04, 0.09, x + 0.12, 0.6, z - 0.1, '#FFFFFF', { seg: 12 });
    else ball(stat, 0.05, x - 0.1, 0.66, z + 0.08, '#E8B36A', { s: [1.3, 0.6, 1] });
    col(x - 0.42, z - 0.42, x + 0.42, z + 0.42);
    chair(x - 0.72, z, PI / 2, CHAIRS[i % 4]);
    chair(x + 0.72, z, -PI / 2, CHAIRS[(i + 1) % 4]);
    seat(`c${i + 1}w`, x - 0.72, z, PI / 2, 0.3, 'chair', { tableY: 0.6, lapZ: 0.55 });
    seat(`c${i + 1}e`, x + 0.72, z, -PI / 2, 0.3, 'chair', { tableY: 0.6, lapZ: 0.55 });
  });

  // ---- 큰 테이블 ----
  box(stat, 5.0, 0.06, 1.2, 10.5, 0.54, 5.2, '#B98D63', { r: 0.02 });
  for (const lx of [8.15, 12.85]) for (const lz of [4.75, 5.65]) box(stat, 0.07, 0.54, 0.07, lx, 0, lz, '#5A3D29', { r: 0.01 });
  for (const [x, c] of [[9.0, '#FFFFFF'], [11.6, '#FF8A3D']]) cyl(stat, 0.045, 0.04, 0.1, x, 0.6, 5.0, c, { seg: 12 });
  ball(stat, 0.09, 10.5, 0.72, 5.2, '#62B46E', { s: [1, 1.3, 1] });
  cyl(stat, 0.08, 0.06, 0.1, 10.5, 0.6, 5.2, '#C46A4A', { seg: 12 });
  col(8.0, 4.6, 13.0, 5.8);
  [8.6, 9.9, 11.2, 12.5].forEach((x, i) => {
    chair(x, 4.05, 0, CHAIRS[i % 4]);
    chair(x, 6.35, PI, CHAIRS[(i + 2) % 4]);
    seat(`L${i + 1}`, x, 4.05, 0, 0.3, 'chair', { tableY: 0.6, lapZ: 0.62 });
    seat(`L${i + 5}`, x, 6.35, PI, 0.3, 'chair', { tableY: 0.6, lapZ: 0.62 });
  });

  // ---- 소파 라운지 ----
  {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.2), mat('#C9B48F'));
    rug.rotation.x = -PI / 2;
    rug.position.set(13.7, 0.004, 8.4);
    rug.receiveShadow = true;
    root.add(rug);
    const sc = '#B5523A';
    box(stat, 0.9, 0.26, 2.4, 15.45, 0.04, 8.4, sc, { r: 0.06 });
    for (const z of [7.62, 8.4, 9.18]) box(stat, 0.66, 0.12, 0.76, 15.32, 0.29, z, '#C4664C', { r: 0.05 });
    box(stat, 0.24, 0.52, 2.4, 15.82, 0.27, 8.4, sc, { r: 0.07 });
    for (const z of [7.3, 9.5]) box(stat, 0.9, 0.42, 0.2, 15.45, 0.04, z, sc, { r: 0.07 });
    col(15.0, 7.2, 16, 9.6);
    [7.62, 8.4, 9.18].forEach((z, i) => seat(`sofa${i + 1}`, 15.25, z, -PI / 2, 0.41, 'sofa', { tableY: null }));
    // 안락의자 둘
    [7.7, 9.1].forEach((z, i) => {
      const g = new THREE.Group();
      g.position.set(12.6, 0, z);
      g.rotation.y = PI / 2;
      stat.add(g);
      box(g, 0.7, 0.3, 0.66, 0, 0.04, 0, '#2F6E5E', { r: 0.08 });
      box(g, 0.7, 0.5, 0.18, 0, 0.3, -0.26, '#2F6E5E', { r: 0.08 });
      for (const s of [-1, 1]) box(g, 0.14, 0.4, 0.66, s * 0.34, 0.04, 0, '#2F6E5E', { r: 0.06 });
      col(12.25, z - 0.36, 12.95, z + 0.36);
      seat(`arm${i + 1}`, 12.66, z, PI / 2, 0.36, 'sofa', { tableY: null });
    });
    box(stat, 1.0, 0.05, 1.2, 13.9, 0.3, 8.4, '#6E4B33', { r: 0.02 });
    for (const lx of [-0.42, 0.42]) for (const lz of [-0.52, 0.52]) box(stat, 0.05, 0.3, 0.05, 13.9 + lx, 0, 8.4 + lz, '#5A3D29', { r: 0.01 });
    cyl(stat, 0.05, 0.045, 0.1, 13.75, 0.35, 8.2, '#FFFFFF', { seg: 12 });
    col(13.4, 7.8, 14.4, 9.0);
    // 스탠드 조명
    cyl(stat, 0.16, 0.18, 0.04, 15.45, 0, 6.6, '#2A2420');
    cyl(stat, 0.02, 0.02, 1.5, 15.45, 0.04, 6.6, '#2A2420', { seg: 8 });
    const shade = cyl(stat, 0.14, 0.24, 0.26, 15.45, 1.5, 6.6, '#FFE2BD', { mat: { emissive: '#FFB36B', emissiveIntensity: 0.5 } });
    shade.castShadow = false;
    col(15.25, 6.4, 15.65, 6.8);
  }

  // ---- 입구, 책장, 화분 ----
  box(stat, 0.8, 0.015, 1.1, 15.45, 0, 10.9, '#5A3D29', { r: 0.005, cast: false });
  box(stat, 0.45, 0.9, 2.8, 0.25, 0, 6.0, '#6E4B33', { r: 0.015 });
  for (let i = 0; i < 9; i++) box(stat, 0.26, 0.24 + R() * 0.08, 0.05, 0.25, 0.9, 4.8 + i * 0.28, ['#E5484D', '#3D6FD8', '#FFD15C', '#3FA66B', '#F3E3C3'][i % 5], { r: 0.005 });
  col(0, 4.6, 0.5, 7.4);
  plant(6.75, 0.42, 1.1);
  col(6.5, 0.17, 7.0, 0.67);
  plant(0.5, 11.4, 1.5);
  col(0.2, 11.1, 0.8, 11.7);
  plant(9.8, 11.4, 1.3);
  col(9.5, 11.1, 10.1, 11.7);
  plant(11.95, 10.55, 1.0);
  col(11.75, 10.35, 12.15, 10.75);

  mergeGroup(stat);
  for (const w of walls) {
    mergeGroup(w.body);
    mergeGroup(w.decor);
  }

  const zones = [
    { id: 'bar', name: '창가 바', x0: 0, z0: 0, x1: 6.6, z1: 1.8, desc: '창밖을 보며 혼자 집중하는 높은 자리.' },
    { id: 'board', name: '현황판', x0: 6.6, z0: 0, x1: 10.3, z1: 2.0, desc: '오늘 누가 무슨 일을 하는지 한눈에 봐요.' },
    { id: 'counter', name: '카운터', x0: 10.3, z0: 0, x1: 16, z1: 2.0, desc: '커피 냄새 나는 바리스타 카운터.' },
    { id: 'tables', name: '테이블석', x0: 0, z0: 1.8, x1: 6.6, z1: 12, desc: '둘이 마주 앉는 작은 원형 테이블.' },
    { id: 'big', name: '큰 테이블', x0: 6.6, z0: 2.0, x1: 13.5, z1: 7.0, desc: '여럿이 노트북 펴고 앉는 긴 테이블.' },
    { id: 'lounge', name: '소파 라운지', x0: 11.5, z0: 6.6, x1: 16, z1: 10.2, desc: '푹신한 소파에서 쉬어 가요.' },
    { id: 'entry', name: '입구', x0: 11.5, z0: 10.2, x1: 16, z1: 12, desc: '어서 오세요!' },
  ];
  const spots = [
    { id: 'board', kind: 'board', x: 8.4, z: 1.0, r: 1.6, label: '현황판 보기' },
    { id: 'door', kind: 'door', x: 15.25, z: 10.9, r: 1.15, label: '나가기' },
  ];

  let skyHour = new Date().getHours();
  let acc = 0;
  function update(dt) {
    for (const w of walls) {
      w.cut = damp(w.cut, w.target, 9, dt);
      w.body.scale.y = 1 - 0.95 * w.cut;
      w.decor.visible = w.cut < 0.45;
    }
    acc += dt;
    if (acc > 30) {
      acc = 0;
      const h = new Date().getHours();
      if (h !== skyHour) {
        skyHour = h;
        const c = skyTex.userData.canvas;
        drawSky(skyTex.userData.ctx, c.width, c.height, h);
        skyTex.needsUpdate = true;
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
    spawn: { x: 14.6, z: 10.9, h: -PI / 2 },
    update,
    setCut,
    toggleFridge: () => false,
    toggleTV: () => false,
  };
}
