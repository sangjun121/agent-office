// 작업실 캐릭터: 동글동글한 몸통 + 큰 머리. 꾸미기와 동작을 모두 여기서 처리한다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { normalizeLook } from './config.js';
import { codeScreenTexture, canvasTex } from './tex.js';
import { damp } from './util.js';
import { drawMark } from './brand.js';

const PI = Math.PI;
export const HEAD_Y = 0.86;
const HEAD_R = 0.3;

const G = {
  head: new THREE.SphereGeometry(HEAD_R, 32, 22),
  face: new THREE.SphereGeometry(HEAD_R * 1.012, 32, 18, PI / 2 - 0.8, 1.6, PI / 2 - 0.5, 1.2),
  // 몸통: 어깨는 좁고 밑단이 퍼지는 종 모양 옷 (가운데가 0, 밑단 -0.2, 목 +0.26)
  torso: new THREE.LatheGeometry(
    [[0, -0.2], [0.14, -0.205], [0.218, -0.19], [0.23, -0.16], [0.222, -0.1], [0.2, -0.01], [0.185, 0.08], [0.158, 0.17], [0.118, 0.225], [0.07, 0.252], [0, 0.26]].map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  ),
  arm: new THREE.CapsuleGeometry(0.064, 0.05, 4, 12), // 짧은 소매
  hand: new THREE.SphereGeometry(0.066, 14, 12), // 소매 아래로 나온 팔 (길쭉하게 늘여 쓴다)
  foot: new THREE.SphereGeometry(0.088, 16, 12),
  leg: new THREE.CylinderGeometry(0.056, 0.064, 1, 12).translate(0, 0.5, 0), // 엉덩이에서 발까지 늘여 쓴다
  hit: new THREE.CylinderGeometry(0.36, 0.36, 1.25, 10),
};
const mats = new Map();
function M(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...extra });
    mats.set(key, m);
  }
  return m;
}
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const _hip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const BLOB_GEO = new THREE.CircleGeometry(0.27, 24);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: '#2A2016', transparent: true, opacity: 0.2, depthWrite: false });

let laptopScreenTex = null;
let stickerTex = null;
let jerseyTex = null; // 축구 유니폼 등번호 7
function numberTex() {
  if (!jerseyTex)
    jerseyTex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '800 116px "Pretendard Variable", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0, 0, 0, .16)';
      g.strokeText('7', w / 2, h / 2 + 6);
      g.fillStyle = '#FAFAF7';
      g.fillText('7', w / 2, h / 2 + 6);
    });
  return jerseyTex;
}
function sharedTextures() {
  if (!laptopScreenTex) laptopScreenTex = codeScreenTexture(77, 192, 128);
  if (!stickerTex)
    stickerTex = canvasTex(128, 128, (g, w, h) => drawMark(g, w / 2, h / 2, w / 2 - 4));
}

// ---------- 옷 무늬: 줄무늬, 체크, 물방울 (색과 무늬마다 한 번만 만든다) ----------
const shirtMats = new Map();
function shirtMat(color, pattern) {
  if (pattern === 'solid') return M(color);
  const key = `${color}|${pattern}`;
  let m = shirtMats.get(key);
  if (m) return m;
  const tex = canvasTex(128, 128, (g, w, h) => {
    const c = new THREE.Color(color);
    const lightBase = c.getHSL({}).l > 0.72;
    const ink = lightBase ? `#${c.clone().lerp(new THREE.Color('#5A6B8C'), 0.55).getHexString()}` : 'rgba(255,255,255,.9)';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    if (pattern === 'stripe') for (let y = 6; y < h; y += 28) g.fillRect(0, y, w, 11);
    else if (pattern === 'check') {
      g.globalAlpha = 0.5;
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h);
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 16);
      g.globalAlpha = 1;
    } else if (pattern === 'dot') {
      for (let y = 12; y < h; y += 32)
        for (let x = (Math.floor(y / 32) % 2) * 16 + 8; x < w; x += 32) {
          g.beginPath();
          g.arc(x, y, 6.5, 0, PI * 2);
          g.fill();
        }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(pattern === 'stripe' ? 1 : 5, pattern === 'stripe' ? 1.6 : 2);
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 });
  shirtMats.set(key, m);
  return m;
}
const PATTERN = { tee: 'stripe', shirt: 'check', hoodie: 'solid', jacket: 'solid', jersey: 'solid' };

// ---------- 주둥이 그림: 밝은 털 위에 코와 'ㅅ' 입 (주둥이 조각의 가운데가 그림 가운데) ----------
function drawMuzzle(g, m, light, nose) {
  g.fillStyle = light;
  g.fillRect(0, 0, 128, 128);
  const NX = 64;
  const NY = 44;
  g.fillStyle = nose;
  g.beginPath();
  g.moveTo(NX - 15, NY - 7);
  g.quadraticCurveTo(NX, NY - 12, NX + 15, NY - 7);
  g.quadraticCurveTo(NX + 12, NY + 8, NX, NY + 11);
  g.quadraticCurveTo(NX - 12, NY + 8, NX - 15, NY - 7);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath();
  g.ellipse(NX - 5, NY - 4, 5, 2.6, -0.3, 0, PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = 5.5;
  g.beginPath();
  g.moveTo(NX, NY + 11);
  g.lineTo(NX, NY + 24);
  g.stroke();
  if (m === 'open') {
    g.fillStyle = INK;
    g.beginPath();
    g.arc(NX, NY + 26, 17, 0, PI);
    g.closePath();
    g.fill();
    g.fillStyle = '#F2788C';
    g.beginPath();
    g.arc(NX, NY + 36, 8, 0, PI);
    g.fill();
  } else if (m === 'wow' || m === 'o' || m === 'sleepy' || m === 'blank') {
    g.beginPath();
    g.ellipse(NX, NY + 34, 7, 8, 0, 0, PI * 2);
    g.stroke();
  } else {
    for (const sg of [-1, 1]) {
      g.beginPath();
      g.arc(NX + sg * 13, NY + 22, 13, sg > 0 ? PI * 0.12 : PI * 0.3, sg > 0 ? PI * 0.7 : PI * 0.88);
      g.stroke();
    }
  }
}

// ---------- 얼굴 ----------
// 귀여워 보이는 비율로 그린다: 큰 눈이 얼굴 가운데보다 조금 아래에 넓게 놓이고, 입은 작고, 볼이 발그레하다.
// (예전에는 눈이 머리 지름의 7%쯤인 작은 점이라 얼굴이 비어 보였다)
const INK = '#2A2320';
const EYE_L = 74; // 눈 가운데 (256칸 그림 기준). 안경 자리(EYE_X, EYE_Y)도 여기에 맞춘다
const EYE_R = 182;
const EYE_Y = 127;
// kind: 'human' 사람 | 'animal' 코와 ㅅ 입을 그리는 동물 | 'eyes' 눈만 (부리, 주둥이는 따로 붙인다). nose 는 코 색
// eye: 'dot' 까만 눈 | 'white' 흰자위가 있는 또렷한 눈 | 'lid' 눈꺼풀이 반쯤 내려온 눈 (lid 는 눈꺼풀 색)
function drawFace(g, expr, mode, kind = 'human', nose = '#3A2A26', rim = false, eye = 'dot', lid = '#C9A27A') {
  g.clearRect(0, 0, 256, 256);
  // 볼
  g.fillStyle = 'rgba(255,112,132,.36)';
  for (const x of [36, 220]) {
    g.beginPath();
    g.ellipse(x, 166, 25, 15, 0, 0, PI * 2);
    g.fill();
  }
  const line = rim ? '#FFFFFF' : INK; // 감은 눈, 웃는 눈의 선
  g.strokeStyle = line;
  g.fillStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = 8;
  // 눈: 세로로 조금 긴 까만 눈에 반짝임 둘
  const dot = (x, y, big = 1) => {
    if (eye !== 'dot') {
      // 흰자위 + 큰 눈동자 + 위 눈꺼풀 선
      const sx = x < 128 ? 1 : -1; // 눈동자는 살짝 안쪽으로
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.ellipse(x, y, 22 * big, 27 * big, 0, 0, PI * 2);
      g.fill();
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(x + sx * 3 * big, y + 3 * big, 13.5 * big, 18 * big, 0, 0, PI * 2);
      g.fill();
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.arc(x + sx * 3 * big + 5 * big, y - 5 * big, 5.4 * big, 0, PI * 2);
      g.fill();
      if (eye === 'lid') {
        // 반쯤 내려온 눈꺼풀
        g.save();
        g.beginPath();
        g.ellipse(x, y, 22 * big, 27 * big, 0, 0, PI * 2);
        g.clip();
        g.fillStyle = lid;
        g.fillRect(x - 30, y - 34, 60, 30 * big);
        g.restore();
        g.strokeStyle = INK;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x - 21 * big, y - 4 * big);
        g.lineTo(x + 21 * big, y - 4 * big);
        g.stroke();
      } else {
        g.strokeStyle = INK;
        g.lineWidth = 5.5;
        g.beginPath();
        g.ellipse(x, y, 22 * big, 27 * big, 0, PI * 1.08, PI * 1.92);
        g.stroke();
      }
      g.strokeStyle = line;
      g.lineWidth = 8;
      return;
    }
    if (rim) {
      // 털이 어두우면 눈 둘레를 하얗게
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.ellipse(x, y, 19 * big + 3.5, 24 * big + 3.5, 0, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x, y, 19 * big, 24 * big, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(x + 7 * big, y - 9 * big, 7 * big, 0, PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath();
    g.arc(x - 6 * big, y + 9 * big, 3 * big, 0, PI * 2);
    g.fill();
  };
  const happy = (x, y) => {
    g.beginPath();
    g.arc(x, y + 12, 17, PI * 1.15, PI * 1.85);
    g.stroke();
  };
  const closed = (x, y) => {
    g.beginPath();
    g.arc(x, y - 10, 17, PI * 0.15, PI * 0.85);
    g.stroke();
  };
  const halfOpen = (x, y) => {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x, y + 2, 17, 15, 0, 0, PI);
    g.fill();
    g.beginPath();
    g.moveTo(x - 20, y + 1);
    g.lineTo(x + 20, y + 1);
    g.stroke();
  };
  const L = EYE_L;
  const Rx = EYE_R;
  const EY = EYE_Y;
  if (mode === 'blink') {
    for (const x of [L, Rx]) {
      g.beginPath();
      g.moveTo(x - 16, EY + 4);
      g.lineTo(x + 16, EY + 4);
      g.stroke();
    }
  } else if (mode === 'happy') {
    happy(L, EY);
    happy(Rx, EY);
  } else if (mode === 'sleep') {
    closed(L, EY);
    closed(Rx, EY);
  } else if (mode === 'wow' || expr === 'wow') {
    dot(L, EY, 1.15);
    dot(Rx, EY, 1.15);
  } else if (expr === 'wink') {
    dot(L, EY);
    happy(Rx, EY);
  } else if (expr === 'blank') {
    // 멍: 작은 점 눈이 살짝 멀리
    g.fillStyle = INK;
    for (const x of [L - 6, Rx + 6]) {
      g.beginPath();
      g.arc(x, EY + 4, 8, 0, PI * 2);
      g.fill();
    }
  } else if (expr === 'tongue') {
    dot(L, EY);
    happy(Rx, EY);
  } else if (expr === 'uneven') {
    // 짝눈: 한쪽은 크고 한쪽은 작게
    dot(L, EY + 3, 1.25);
    dot(Rx, EY - 5, 0.6);
  } else if (expr === 'sleepy') {
    halfOpen(L, EY);
    halfOpen(Rx, EY);
  } else if (expr === 'calm') {
    dot(L, EY, 0.86);
    dot(Rx, EY, 0.86);
  } else {
    dot(L, EY);
    dot(Rx, EY);
  }
  if (kind === 'eyes') return;
  // 입: 눈 사이 아래에 작게
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = 6.5;
  const MY = 166;
  const m = mode === 'happy' ? 'open' : mode === 'sleep' ? 'o' : mode === 'wow' ? 'wow' : expr;
  if (kind === 'human') {
    // 사람: 눈 사이 아래의 작은 세모 코
    g.fillStyle = nose;
    g.beginPath();
    g.moveTo(128, 138);
    g.quadraticCurveTo(137, 151, 134, 152);
    g.lineTo(122, 152);
    g.quadraticCurveTo(119, 151, 128, 138);
    g.fill();
  }
  if (kind === 'animal') {
    // 동물: 작은 코 아래로 'ㅅ' 모양 입 (기쁠 때는 입을 벌린다)
    const NY = 150;
    g.fillStyle = nose;
    g.beginPath();
    g.moveTo(128 - 11, NY - 5);
    g.quadraticCurveTo(128, NY - 9, 128 + 11, NY - 5);
    g.quadraticCurveTo(128 + 9, NY + 6, 128, NY + 8);
    g.quadraticCurveTo(128 - 9, NY + 6, 128 - 11, NY - 5);
    g.fill();
    g.lineWidth = 5.5;
    g.beginPath();
    g.moveTo(128, NY + 8);
    g.lineTo(128, NY + 15);
    g.stroke();
    if (m === 'open') {
      g.fillStyle = INK;
      g.beginPath();
      g.arc(128, NY + 16, 12, 0, PI);
      g.closePath();
      g.fill();
      g.fillStyle = '#F2788C';
      g.beginPath();
      g.arc(128, NY + 23, 6, 0, PI);
      g.fill();
    } else if (m === 'wow' || m === 'o' || m === 'sleepy' || m === 'blank') {
      g.beginPath();
      g.ellipse(128, NY + 22, 6, 6.5, 0, 0, PI * 2);
      g.stroke();
    } else {
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.arc(128 + sgn * 9, NY + 14, 9, sgn > 0 ? PI * 0.15 : PI * 0.25, sgn > 0 ? PI * 0.75 : PI * 0.85);
        g.stroke();
      }
    }
    return;
  }
  if (m === 'open') {
    g.beginPath();
    g.arc(128, MY - 2, 16, 0, PI);
    g.closePath();
    g.fill();
    g.fillStyle = '#F2788C';
    g.beginPath();
    g.arc(128, MY + 7, 8, 0, PI);
    g.fill();
  } else if (m === 'cat') {
    g.beginPath();
    g.arc(119, MY - 2, 9, PI * 0.08, PI * 0.92);
    g.stroke();
    g.beginPath();
    g.arc(137, MY - 2, 9, PI * 0.08, PI * 0.92);
    g.stroke();
  } else if (m === 'wow') {
    g.beginPath();
    g.ellipse(128, MY + 6, 8, 11, 0, 0, PI * 2);
    g.fill();
  } else if (m === 'calm') {
    g.beginPath();
    g.moveTo(119, MY + 3);
    g.lineTo(137, MY + 3);
    g.stroke();
  } else if (m === 'tongue') {
    g.beginPath();
    g.arc(128, MY - 10, 15, PI * 0.18, PI * 0.82);
    g.stroke();
    g.fillStyle = '#F2788C';
    g.beginPath();
    g.ellipse(133, MY + 9, 9, 11, 0.2, 0, PI * 2);
    g.fill();
    g.strokeStyle = '#D9566C';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(133, MY + 2);
    g.lineTo(134, MY + 14);
    g.stroke();
  } else if (m === 'uneven') {
    g.beginPath();
    g.moveTo(112, MY + 3);
    g.bezierCurveTo(119, MY - 5, 124, MY + 10, 131, MY + 3);
    g.bezierCurveTo(137, MY - 3, 142, MY + 7, 146, MY + 1);
    g.stroke();
  } else if (m === 'blank') {
    g.beginPath();
    g.ellipse(132, MY + 6, 5, 4.5, 0, 0, PI * 2);
    g.stroke();
  } else if (m === 'sleepy' || m === 'o') {
    g.beginPath();
    g.ellipse(128, MY + 4, 6.5, 5.5, 0, 0, PI * 2);
    g.stroke();
  } else {
    // 방긋: 작은 미소
    g.beginPath();
    g.arc(128, MY - 9, 14, PI * 0.2, PI * 0.8);
    g.stroke();
  }
}
// 얼굴 그림의 눈 자리를 머리 위 좌표로 (안경을 눈에 맞춰 씌운다). 그림은 가로 1.6, 세로 1.2 라디안을 덮는다
const EYE_X = Math.sin((EYE_R / 256 - 0.5) * 1.6) * HEAD_R;
const EYE_YY = Math.sin(0.5 - (EYE_Y / 256) * 1.2) * HEAD_R;

// 동작 길이(초)
export const EMOTE_DUR = { wave: 1.7, heart: 1.8, sip: 1.5, boom: 0.9, salute: 1.8 };

export class Avatar {
  // blob: 실시간 그림자 대신 발밑에 옅은 동그란 그림자 (캐릭터가 많아도 가볍다)
  constructor(look, { shadow = true, blob = false } = {}) {
    sharedTextures();
    this.root = new THREE.Group();
    this.pose = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.pose);
    this.pose.add(this.body);
    if (blob) {
      const disc = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.012;
      disc.renderOrder = -1;
      this.root.add(disc);
    }
    this.shadow = shadow;

    this.torso = this.mesh(G.torso, null, this.body);
    this.torso.position.y = 0.37;
    this.torso.scale.set(1, 1, 0.92);

    this.head = new THREE.Group();
    this.head.position.y = HEAD_Y;
    this.body.add(this.head);
    this.headMesh = this.mesh(G.head, null, this.head);
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = this.faceCanvas.height = 256;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    this.faceMesh = new THREE.Mesh(
      G.face,
      new THREE.MeshStandardMaterial({ map: this.faceTex, transparent: true, roughness: 0.7, depthWrite: false }),
    );
    this.head.add(this.faceMesh);

    this.armA = this.makeArm(-1);
    this.armB = this.makeArm(1);
    this.footA = this.mesh(G.foot, M('#33363B'), this.pose);
    this.footB = this.mesh(G.foot, M('#33363B'), this.pose);
    for (const f of [this.footA, this.footB]) f.scale.set(1.02, 0.62, 1.32);
    // 다리: 옷 밑단 아래로 보이는 짧은 다리. 엉덩이와 발을 매 장 이어 준다
    this.legA = this.mesh(G.leg, null, this.pose);
    this.legB = this.mesh(G.leg, null, this.pose);
    // 주둥이 그림 (코와 입): 주둥이가 튀어나온 동물만 쓴다
    this.muzCanvas = document.createElement('canvas');
    this.muzCanvas.width = this.muzCanvas.height = 128;
    this.muzCtx = this.muzCanvas.getContext('2d');
    this.muzTex = new THREE.CanvasTexture(this.muzCanvas);
    this.muzTex.colorSpace = THREE.SRGBColorSpace;
    this.muzzle = null;

    this.headDeco = new THREE.Group();
    this.bodyDeco = new THREE.Group();
    this.head.add(this.headDeco);
    this.body.add(this.bodyDeco);
    this.decoGeos = [];

    this.hitbox = new THREE.Mesh(G.hit, HIT_MAT);
    this.hitbox.position.y = 0.62;
    this.root.add(this.hitbox);

    this.buildProps();

    // 부드럽게 따라갈 관절 값
    this.C = {};
    this.T = {};
    this.resetTargets();
    Object.assign(this.C, this.T);
    this.phase = 0;
    this.spinY = 0;
    this.blinkT = 1 + Math.random() * 3;
    this.blinking = 0;
    this.faceKey = '';
    this.setLook(look);
  }

  mesh(geo, material, parent) {
    const m = new THREE.Mesh(geo, material || M('#ffffff'));
    m.castShadow = this.shadow;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.205, 0.53, 0);
    this.body.add(pivot);
    const sleeve = this.mesh(G.arm, null, pivot);
    sleeve.position.y = -0.055;
    const hand = this.mesh(G.hand, null, pivot);
    hand.position.y = -0.17;
    hand.scale.set(1, 1.65, 1);
    const socket = new THREE.Group();
    socket.position.y = -0.24;
    pivot.add(socket);
    return { pivot, sleeve, hand, socket };
  }

  buildProps() {
    const white = M('#FAFAF7');
    // 아이스 아메리카노
    this.cup = new THREE.Group();
    const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.036, 0.13, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, roughness: 0.2 }));
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, 0.095, 14), M('#3B2416'));
    coffee.position.y = -0.012;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14), white);
    lid.position.y = 0.068;
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), M('#3FA66B'));
    straw.position.set(0.012, 0.12, 0);
    this.cup.add(cupBody, coffee, lid, straw);
    this.cup.position.set(0, -0.04, 0.05);
    this.armA.socket.add(this.cup);

    // 종이 총: 접은 종이 느낌
    this.gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.055), white);
    barrel.position.set(0, -0.1, 0.01);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.11), M('#F3E3C3'));
    grip.position.set(0, -0.01, -0.05);
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.2, 0.006), M('#D9D4C7'));
    fold.position.set(0, -0.1, 0.04);
    this.gun.add(barrel, grip, fold);
    for (const m of [barrel, grip]) m.castShadow = this.shadow;
    this.armA.socket.add(this.gun);

    // 연필
    this.pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.13, 6), M('#FFD15C'));
    this.pencil.rotation.x = PI / 2;
    this.pencil.position.set(0, -0.02, 0.05);
    this.armA.socket.add(this.pencil);

    // 스케치북
    this.sketch = new THREE.Group();
    const sk = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.012, 0.16, 1, 0.004), white);
    const skc = new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.01, 0.17, 1, 0.004), M('#3D6FD8'));
    skc.position.y = -0.008;
    const doodle = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), M('#FF8A3D'));
    doodle.rotation.x = -PI / 2;
    doodle.position.set(0.03, 0.007, 0.01);
    this.sketch.add(sk, skc, doodle);
    this.sketch.position.set(0.05, 0.4, 0.27);
    this.sketch.rotation.x = 0.55;
    this.body.add(this.sketch);

    // 책 (펼친 상태)
    this.book = new THREE.Group();
    this.bookCover = new THREE.MeshStandardMaterial({ color: '#3D6FD8', roughness: 0.7 });
    for (const s of [-1, 1]) {
      const half = new THREE.Group();
      half.rotation.y = s * 0.32;
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.012), white);
      page.position.x = s * 0.06;
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.165, 0.008), this.bookCover);
      cover.position.set(s * 0.062, 0, -0.01);
      half.add(page, cover);
      this.book.add(half);
    }
    this.book.position.set(0, 0.45, 0.27);
    this.book.rotation.x = -0.75;
    this.body.add(this.book);

    // 노트북 (책상 위나 무릎 위)
    this.laptop = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.018, 0.24, 1, 0.006), M('#B8BEC6'));
    const scr = new THREE.Group();
    scr.position.set(0, 0.012, 0.115);
    scr.rotation.x = 0.3;
    const lid2 = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.23, 0.012, 1, 0.005), M('#B8BEC6'));
    lid2.position.y = 0.115;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: laptopScreenTex, toneMapped: false }));
    screen.position.set(0, 0.115, -0.0068);
    screen.rotation.y = PI;
    const st = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshStandardMaterial({ map: stickerTex }));
    st.position.set(0.06, 0.13, 0.0068);
    scr.add(lid2, screen, st);
    base.castShadow = lid2.castShadow = this.shadow;
    this.laptop.add(base, scr);
    this.root.add(this.laptop);

    for (const p of [this.cup, this.gun, this.pencil, this.sketch, this.book, this.laptop]) p.visible = false;
  }

  setBookColor(title) {
    const colors = ['#3D6FD8', '#E5484D', '#3FA66B', '#8E6CCF', '#FF8A3D', '#28366B'];
    let h = 0;
    for (const ch of String(title || '')) h = (h * 31 + ch.codePointAt(0)) | 0;
    this.bookCover.color.set(colors[Math.abs(h) % colors.length]);
  }

  // ---------- 꾸미기 ----------
  setLook(look) {
    const L = normalizeLook(look);
    this.look = L;
    const skin = M(L.skin, { emissive: L.skin, emissiveIntensity: 0.16 }); // 그늘진 쪽이 탁해 보이지 않게
    this.headMesh.material = skin;
    this.armA.hand.material = this.armB.hand.material = skin;
    this.torso.material = shirtMat(L.cloth, PATTERN[L.top] || 'solid'); // 티셔츠는 줄무늬, 셔츠는 체크
    this.legA.material = this.legB.material = skin;
    this.muzzle = null;
    const sleeve = L.top === 'jacket' ? M('#F3E9D2') : M(L.cloth);
    this.armA.sleeve.material = this.armB.sleeve.material = sleeve;

    for (const g of this.decoGeos) g.dispose();
    this.decoGeos = [];
    this.headDeco.clear();
    this.bodyDeco.clear();
    this.tail = null;
    this.snot = null;
    this.ahoge = null;

    const hairM = M(L.hairColor, { emissive: L.hairColor, emissiveIntensity: 0.06 });
    // 종류: 사람이 아니면 동물 주민. 털 색은 피부 색 칸을 쓰고, 머리카락 대신 귀와 주둥이를 붙인다
    const sp = L.species && L.species !== 'human' ? L.species : null;
    const hairStyle = sp ? 'none' : L.hair;
    this.faceKind = sp ? 'eyes' : 'human'; // 동물의 코와 입은 튀어나온 주둥이(또는 부리)에 따로 있다
    const shade = (c, to, k) => `#${new THREE.Color(c).lerp(new THREE.Color(to), k).getHexString()}`;
    this.noseColor = !sp ? shade(L.skin, '#D9663A', 0.42) : sp === 'rabbit' || sp === 'cat' || sp === 'hamster' ? '#E8738A' : '#3A2A26';
    this.lidColor = shade(L.skin, '#5A3A2A', 0.3); // 눈꺼풀: 털(피부)보다 조금 짙게
    const lum = new THREE.Color(L.skin).getHSL({}).l;
    this.eyeRim = !!sp && sp !== 'penguin' && lum < 0.45; // 어두운 털이면 눈에 흰 테 (펭귄은 얼굴이 하얗다)
    // 동물은 머리가 옆으로 조금 넓적하다
    this.head.scale.set(sp ? 1.1 : 1, sp ? 0.97 : 1, sp ? 1.03 : 1);
    const paw = sp ? skin : M('#33363B');
    this.footA.material = this.footB.material = paw;
    const acc = M(L.accent);
    const dark = M('#2A2A2E');
    const add = (parent, geo, material, p = [0, 0, 0], r = [0, 0, 0], s) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(p[0], p[1], p[2]);
      m.rotation.set(r[0], r[1], r[2]);
      if (s) m.scale.set(s[0], s[1], s[2]);
      m.castShadow = this.shadow;
      parent.add(m);
      this.decoGeos.push(geo);
      return m;
    };
    const H = this.headDeco;
    const B = this.bodyDeco;

    // 머리카락: 뒤로 기운 덮개(cap) 위에 앞머리를 내린다.
    // 예전에는 덮개만 있어서 이마가 훤히 드러나고 헬멧을 쓴 것처럼 보였다
    const shineM = M(`#${new THREE.Color(L.hairColor).lerp(new THREE.Color('#FFFFFF'), 0.32).getHexString()}`, { emissive: L.hairColor, emissiveIntensity: 0.12 });
    // 윤기: 정수리 옆으로 흐르는 밝은 띠 (위에서 봐도 한 가지 색 공처럼 보이지 않게)
    const shine = (r = 0.3215) => add(H, new THREE.SphereGeometry(r, 28, 3, PI / 2 - 1.0, 1.25, 0.5, 0.1), shineM, [0, 0, 0], [-0.3, 0.25, 0]);
    const cap = () => {
      shine();
      return add(H, new THREE.SphereGeometry(0.32, 32, 16, 0, PI * 2, 0, 1.28), hairM, [0, 0, 0], [-0.35, 0, 0]);
    };
    // 앞머리 띠: 이마를 덮는다 (low: 위에서부터 어디까지 내려오는지, 눈은 1.56쯤에 있다)
    const fringe = (low = 1.24, wide = 1.25) => add(H, new THREE.SphereGeometry(0.323, 40, 10, PI / 2 - wide, wide * 2, 0.5, low - 0.5), hairM);
    // 앞머리 끝의 동글동글한 가닥: a 는 앞에서 옆으로 돌아간 각, th 는 높이, r 은 크기
    const tuft = (a, th, r, sy = 0.8) => {
      const R0 = 0.312;
      const m = add(H, new THREE.SphereGeometry(r, 16, 12), hairM, [R0 * Math.sin(th) * Math.sin(a), R0 * Math.cos(th), R0 * Math.sin(th) * Math.cos(a)], [0, a, 0], [1.15, sy, 0.5]);
      return m;
    };
    const softBangs = () => {
      fringe(1.2);
      [[-0.84, 1.24, 0.085], [-0.42, 1.27, 0.095], [0.02, 1.3, 0.1], [0.46, 1.26, 0.09], [0.86, 1.22, 0.08]].forEach(([a, th, r]) => tuft(a, th, r));
    };
    const sideBangs = () => {
      // 가르마를 한쪽으로: 한쪽은 길게, 한쪽은 짧게
      fringe(1.16);
      [[-0.9, 1.3, 0.09], [-0.5, 1.33, 0.105], [-0.08, 1.3, 0.1], [0.36, 1.2, 0.085], [0.8, 1.16, 0.075]].forEach(([a, th, r]) => tuft(a, th, r));
    };
    if (hairStyle === 'short') {
      cap();
      softBangs();
    }
    if (hairStyle === 'bob') {
      // 단발: 옆과 뒤를 턱까지 내리고 앞머리는 일자로
      cap();
      const shell = new THREE.SphereGeometry(0.332, 32, 16, PI / 2 + 0.98, PI * 2 - 1.96, 0.5, 1.5);
      add(H, shell, M(L.hairColor, { side: THREE.DoubleSide, emissive: L.hairColor, emissiveIntensity: 0.06 }));
      fringe(1.33, 1.05);
    }
    if (hairStyle === 'bun') {
      cap();
      sideBangs();
      add(H, new THREE.SphereGeometry(0.13, 16, 12), hairM, [0, 0.33, -0.1]);
    }
    if (hairStyle === 'ponytail') {
      cap();
      softBangs();
      // 귀 옆으로 내린 잔머리
      for (const s of [-1, 1]) tuft(s * 1.32, 1.5, 0.07, 1.5);
      const tail = new THREE.Group();
      tail.position.set(0, 0.13, -0.27);
      H.add(tail);
      add(tail, new THREE.TorusGeometry(0.045, 0.02, 8, 16), acc, [0, 0, 0], [PI / 2 - 0.4, 0, 0]);
      add(tail, new THREE.SphereGeometry(0.1, 16, 12), hairM, [0, -0.15, -0.02], [0, 0, 0], [0.8, 1.75, 0.8]);
      add(tail, new THREE.SphereGeometry(0.06, 12, 10), hairM, [0, -0.31, -0.03], [0, 0, 0], [0.9, 1.2, 0.9]);
      this.tail = tail;
    }
    if (hairStyle === 'bowl') {
      // 바가지 머리: 눈썹 위에서 둥글게 자른 머리. 끝을 동글동글하게 해서 모자처럼 보이지 않게
      add(H, new THREE.SphereGeometry(0.325, 32, 16, 0, PI * 2, 0, 1.3), hairM);
      shine(0.3265);
      for (let i = 0; i < 16; i++) tuft((i / 16) * PI * 2, 1.33, 0.078, 0.72);
    }
    if (hairStyle === 'quiff') {
      // 올림머리: 짧은 머리에 앞머리를 위로 세운다
      cap();
      add(H, new THREE.SphereGeometry(0.1, 20, 14), hairM, [0, 0.25, 0.15], [-0.55, 0, 0], [1.55, 0.78, 1.15]);
      add(H, new THREE.SphereGeometry(0.07, 16, 12), hairM, [0.05, 0.31, 0.08], [-0.4, 0, 0.2], [1.3, 0.7, 1.1]);
    }
    if (hairStyle === 'curly') {
      cap();
      fringe(1.1);
      for (let i = 0; i < 14; i++) {
        const th = 0.25 + (i % 3) * 0.42;
        const ph = (i / 14) * PI * 2;
        const back = Math.cos(ph) < -0.2 || th < 0.5 ? 1 : 0.92;
        add(H, new THREE.SphereGeometry(0.1, 10, 8), hairM, [
          Math.sin(th) * Math.sin(ph) * 0.29 * back,
          Math.cos(th) * 0.29 + 0.03,
          Math.sin(th) * Math.cos(ph) * 0.29 - 0.03,
        ]);
      }
      // 이마 위의 곱슬
      [[-0.8, 1.16], [-0.4, 1.22], [0, 1.25], [0.4, 1.22], [0.8, 1.16]].forEach(([a, th]) =>
        add(H, new THREE.SphereGeometry(0.075, 10, 8), hairM, [0.3 * Math.sin(th) * Math.sin(a), 0.3 * Math.cos(th), 0.3 * Math.sin(th) * Math.cos(a)]),
      );
    }

    if (sp) {
      const tone = (c, to, k) => `#${new THREE.Color(c).lerp(new THREE.Color(to), k).getHexString()}`;
      const fur = skin;
      const lightC = sp === 'penguin' || sp === 'fox' ? '#FFFDF8' : tone(L.skin, '#FFFFFF', 0.62);
      const light = M(lightC, { emissive: lightC, emissiveIntensity: 0.14 });
      const darkC = tone(L.skin, '#3A2418', 0.38);
      const darkF = M(darkC, { emissive: darkC, emissiveIntensity: 0.1 });
      const pink = M('#F7A8BC', { emissive: '#F7A8BC', emissiveIntensity: 0.14 });
      const ink = M('#3A2A26');
      const beakM = M('#FFA63D', { emissive: '#FFA63D', emissiveIntensity: 0.14 });
      // 주둥이 둘레의 밝은 털: 머리 겉면에 붙은 얇은 조각 (wide: 옆으로 얼마나, top: 어디서부터)
      // 머리 겉면에 붙는 동그란 털 조각: size 는 크기(각), drop 은 얼굴 가운데에서 아래로 내려간 정도
      const patch = (size, drop, material = light, r = 0.3018) => add(H, new THREE.SphereGeometry(r, 36, 10, 0, PI * 2, 0, size), material, [0, 0, 0], [PI / 2 + drop, 0, 0]);
      // 튀어나온 주둥이: 밝은 털 덩어리에 코와 입 그림을 입힌다 (크기 sx, sy, sz, 자리 y, z)
      const snout = (sx, sy, sz, y, z) => {
        const mat = new THREE.MeshStandardMaterial({ map: this.muzTex, roughness: 0.8, emissive: lightC, emissiveIntensity: 0.1 });
        add(H, new THREE.SphereGeometry(1, 24, 16, PI / 2 - 1.45, 2.9, 0.2, PI - 0.4), mat, [0, y, z], [0, 0, 0], [sx, sy, sz]);
        this.muzzle = { light: lightC, nose: this.noseColor };
      };
      const roundEars = (r, x, y, inner) => {
        for (const sg of [-1, 1]) {
          add(H, new THREE.SphereGeometry(r, 18, 14), fur, [sg * x, y, -0.02], [0, 0, 0], [1, 1, 0.6]);
          if (inner) add(H, new THREE.SphereGeometry(r * 0.58, 14, 10), inner, [sg * x, y - 0.005, 0.03], [0, 0, 0], [1, 1, 0.5]);
        }
      };
      const pointEars = (r, h, x, y, lean, inner, tip) => {
        for (const sg of [-1, 1]) {
          add(H, new THREE.ConeGeometry(r, h, 14), fur, [sg * x, y, -0.02], [0, 0, -sg * lean]);
          if (inner) add(H, new THREE.ConeGeometry(r * 0.56, h * 0.62, 12), inner, [sg * x, y - 0.012, 0.035], [0.12, 0, -sg * lean]);
          if (tip) add(H, new THREE.ConeGeometry(r * 0.5, h * 0.48, 12), tip, [sg * (x + Math.sin(lean) * h * 0.27), y + Math.cos(lean) * h * 0.27, -0.02], [0, 0, -sg * lean]);
        }
      };
      if (sp === 'cat') {
        pointEars(0.1, 0.17, 0.185, 0.27, 0.32, pink);
        snout(0.1, 0.07, 0.06, -0.095, 0.262);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.2, -0.16), new THREE.Vector3(0, 0.26, -0.3), new THREE.Vector3(0.03, 0.4, -0.33), new THREE.Vector3(0.08, 0.5, -0.27)]);
        add(B, new THREE.TubeGeometry(curve, 20, 0.032, 8, false), fur);
        add(B, new THREE.SphereGeometry(0.034, 10, 8), fur, [0.08, 0.5, -0.27]);
      }
      if (sp === 'dog') {
        // 축 늘어진 귀
        for (const sg of [-1, 1]) add(H, new THREE.SphereGeometry(0.115, 18, 14), darkF, [sg * 0.285, 0.1, -0.03], [0, 0, sg * 0.22], [0.5, 1.3, 0.85]);
        snout(0.118, 0.085, 0.125, -0.11, 0.245);
        add(B, new THREE.SphereGeometry(0.05, 12, 10), fur, [0, 0.27, -0.2], [0.7, 0, 0], [0.8, 1.7, 0.8]);
      }
      if (sp === 'bear') {
        roundEars(0.1, 0.205, 0.24, light);
        snout(0.112, 0.085, 0.085, -0.1, 0.252);
        add(B, new THREE.SphereGeometry(0.055, 12, 10), fur, [0, 0.22, -0.19]);
      }
      if (sp === 'rabbit') {
        for (const sg of [-1, 1]) {
          add(H, new THREE.SphereGeometry(0.075, 16, 14), fur, [sg * 0.11, 0.44, -0.03], [0, 0, -sg * 0.13], [1, 3.1, 0.55]);
          add(H, new THREE.SphereGeometry(0.045, 14, 12), pink, [sg * 0.11, 0.44, 0.005], [0, 0, -sg * 0.13], [1, 3.6, 0.4]);
        }
        snout(0.09, 0.065, 0.055, -0.095, 0.266);
        add(B, new THREE.SphereGeometry(0.075, 14, 12), light, [0, 0.22, -0.2]);
      }
      if (sp === 'fox') {
        pointEars(0.11, 0.22, 0.19, 0.28, 0.3, light, darkF);
        // 볼까지 내려오는 하얀 털
        patch(0.66, 0.6);
        snout(0.1, 0.078, 0.15, -0.1, 0.232);
        add(B, new THREE.SphereGeometry(0.12, 16, 12), fur, [0, 0.3, -0.31], [-0.7, 0, 0], [0.8, 0.8, 1.9]);
        add(B, new THREE.SphereGeometry(0.075, 14, 12), light, [0, 0.42, -0.45]);
      }
      if (sp === 'hamster') {
        roundEars(0.075, 0.2, 0.25, pink);
        // 볼이 통통한 하얀 털
        patch(0.62, 0.52);
        snout(0.115, 0.072, 0.055, -0.1, 0.264);
      }
      if (sp === 'koala') {
        for (const sg of [-1, 1]) {
          add(H, new THREE.SphereGeometry(0.14, 18, 14), fur, [sg * 0.27, 0.19, -0.02], [0, 0, 0], [1, 1, 0.6]);
          add(H, new THREE.SphereGeometry(0.085, 14, 10), light, [sg * 0.27, 0.185, 0.045], [0, 0, 0], [1, 1, 0.5]);
        }
        add(H, new THREE.SphereGeometry(0.052, 16, 12), ink, [0, -0.04, 0.3], [0, 0, 0], [0.9, 1.35, 0.6]);
      }
      if (sp === 'pig') {
        for (const sg of [-1, 1]) add(H, new THREE.ConeGeometry(0.085, 0.13, 12), darkF, [sg * 0.19, 0.25, 0.02], [0.5, 0, -sg * 0.5]);
        add(H, new THREE.CylinderGeometry(0.078, 0.085, 0.05, 22), darkF, [0, -0.05, 0.3], [PI / 2, 0, 0], [1.15, 1, 0.9]);
        for (const sg of [-1, 1]) add(H, new THREE.SphereGeometry(0.016, 8, 6), ink, [sg * 0.03, -0.05, 0.328]);
        const curl = add(B, new THREE.TorusGeometry(0.04, 0.014, 6, 14), fur, [0, 0.24, -0.2], [0, PI / 2, 0]);
        curl.castShadow = false;
      }
      if (sp === 'penguin') {
        // 하얀 얼굴과 주황 부리
        patch(0.86, 0.1);
        add(H, new THREE.SphereGeometry(0.055, 16, 12), beakM, [0, -0.06, 0.305], [0, 0, 0], [1.25, 0.6, 1]);
      }
      if (sp === 'duck') {
        add(H, new THREE.SphereGeometry(0.07, 18, 12), beakM, [0, -0.06, 0.31], [0, 0, 0], [1.45, 0.5, 1.05]);
        for (const [x, y] of [[-0.03, 0.31], [0.02, 0.33], [0.06, 0.3]]) add(H, new THREE.SphereGeometry(0.04, 10, 8), fur, [x, y, 0], [0, 0, 0], [0.8, 1.5, 0.8]);
        add(B, new THREE.ConeGeometry(0.06, 0.12, 10), fur, [0, 0.24, -0.2], [-1.1, 0, 0]);
      }
    }

    // 모자, 장식
    if (L.hat === 'beanie') {
      add(H, new THREE.SphereGeometry(0.335, 32, 16, 0, PI * 2, 0, 1.15), acc, [0, 0, 0], [-0.2, 0, 0]);
      const rim = add(H, new THREE.TorusGeometry(0.305, 0.045, 8, 32), acc, [0, 0, 0], [PI / 2 - 0.2, 0, 0]);
      rim.position.set(0, Math.cos(1.15) * 0.335 * Math.cos(0.2), -Math.cos(1.15) * 0.335 * Math.sin(0.2));
      add(H, new THREE.SphereGeometry(0.075, 12, 10), M('#FAFAF7'), [0, 0.34, -0.07]);
    }
    if (L.hat === 'cap') {
      add(H, new THREE.SphereGeometry(0.326, 32, 12, 0, PI * 2, 0, 1.2), acc, [0, 0, 0], [-0.15, 0, 0]);
      add(H, new THREE.CylinderGeometry(0.17, 0.17, 0.025, 24), acc, [0, 0.15, 0.27], [0.15, 0, 0], [1, 1, 1.3]);
      add(H, new THREE.SphereGeometry(0.025, 8, 6), acc, [0, 0.33, -0.05]);
    }
    if (L.hat === 'phones') {
      add(H, new THREE.TorusGeometry(0.325, 0.028, 8, 24, PI), acc, [0, 0.02, 0]);
      for (const s of [-1, 1]) {
        add(H, new THREE.CylinderGeometry(0.095, 0.095, 0.08, 20), acc, [s * 0.315, 0.0, 0], [0, 0, PI / 2]);
        add(H, new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), dark, [s * 0.275, 0.0, 0], [0, 0, PI / 2]);
      }
    }
    if (L.hat === 'cat') {
      for (const s of [-1, 1]) {
        add(H, new THREE.ConeGeometry(0.095, 0.17, 12), hairM, [s * 0.17, 0.27, -0.02], [0, 0, -s * 0.38]);
        add(H, new THREE.ConeGeometry(0.05, 0.1, 10), M('#F6A6C1'), [s * 0.168, 0.265, 0.03], [0, 0, -s * 0.38]);
      }
    }
    if (L.hat === 'ribbon') {
      for (const s of [-1, 1]) add(H, new THREE.ConeGeometry(0.07, 0.13, 12), acc, [0.16 + s * 0.075, 0.25, 0.06], [0, 0, (s * PI) / 2 + 0.3]);
      add(H, new THREE.SphereGeometry(0.035, 10, 8), acc, [0.16, 0.25, 0.08]);
    }
    if (L.hat === 'sprout') {
      const green = M('#5DBB63');
      add(H, new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), green, [0, 0.36, 0]);
      for (const s of [-1, 1]) add(H, new THREE.SphereGeometry(0.06, 12, 8), green, [s * 0.065, 0.43, 0], [0, 0, s * 0.45], [1.45, 0.35, 0.85]);
    }
    if (L.hat === 'ahoge') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.29, 0.02),
        new THREE.Vector3(0.015, 0.4, 0.05),
        new THREE.Vector3(0.07, 0.47, 0.1),
        new THREE.Vector3(0.12, 0.44, 0.14),
        new THREE.Vector3(0.12, 0.4, 0.13),
      ]);
      const strand = new THREE.Group();
      H.add(strand);
      add(strand, new THREE.TubeGeometry(curve, 24, 0.016, 6, false), hairM);
      this.ahoge = strand;
    }
    if (L.hat === 'crown') {
      const gold = M('#F2C14E', { metalness: 0.35, roughness: 0.35 });
      add(H, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20, 1, true), M('#F2C14E', { metalness: 0.35, roughness: 0.35, side: THREE.DoubleSide }), [0, 0.3, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        add(H, new THREE.ConeGeometry(0.035, 0.08, 8), gold, [Math.sin(a) * 0.16, 0.37, Math.cos(a) * 0.16]);
      }
      add(H, new THREE.SphereGeometry(0.025, 8, 6), M('#E5484D'), [0, 0.3, 0.163]);
    }

    // 안경
    const ex = EYE_X;
    const ey = EYE_YY;
    const ez = Math.sqrt(Math.max(0, 0.306 * 0.306 - ex * ex - ey * ey));
    if (L.glasses === 'round' || L.glasses === 'square') {
      for (const s of [-1, 1]) {
        const ring = L.glasses === 'round' ? new THREE.TorusGeometry(0.074, 0.011, 8, 28) : new THREE.TorusGeometry(0.078, 0.011, 6, 4);
        add(H, ring, dark, [s * ex, ey, ez - (L.glasses === 'square' ? 0.006 : 0)], [0, s * 0.4, L.glasses === 'square' ? PI / 4 : 0]);
      }
      add(H, new THREE.CylinderGeometry(0.007, 0.007, 0.07, 6), dark, [0, ey + 0.012, ez + 0.02], [0, 0, PI / 2]);
    }
    if (L.glasses === 'sun') {
      const lens = M('#1D1D22', { roughness: 0.2, metalness: 0.4 });
      for (const s of [-1, 1]) add(H, new THREE.CylinderGeometry(0.08, 0.08, 0.014, 24), lens, [s * ex, ey, ez], [PI / 2, 0, -s * 0.34], [1, 1, 0.85]);
      add(H, new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), dark, [0, ey + 0.012, ez + 0.02], [0, 0, PI / 2]);
    }

    if (L.glasses === 'bandaid') {
      add(H, new RoundedBoxGeometry(0.12, 0.048, 0.012, 1, 0.012), M('#F2C6A0'), [0.115, -0.07, 0.274], [0, 0.42, -0.4]);
      add(H, new RoundedBoxGeometry(0.04, 0.034, 0.014, 1, 0.006), M('#E2A77C'), [0.117, -0.071, 0.276], [0, 0.42, -0.4]);
    }
    if (L.glasses === 'snot') {
      this.snot = add(H, new THREE.SphereGeometry(0.034, 16, 12), new THREE.MeshStandardMaterial({ color: '#A9DDF5', transparent: true, opacity: 0.6, roughness: 0.08 }), [0.032, -0.06, 0.298]);
      this.snot.castShadow = false;
    }

    // 옷 모양
    if (L.top === 'hoodie') {
      add(B, new THREE.TorusGeometry(0.15, 0.06, 10, 24), M(L.cloth), [0, 0.6, -0.1], [PI / 2 + 0.5, 0, 0]);
      for (const s of [-1, 1]) add(B, new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), M('#F7F5F0'), [s * 0.05, 0.5, 0.175]);
      add(B, new RoundedBoxGeometry(0.2, 0.08, 0.02, 1, 0.008), M(L.cloth), [0, 0.27, 0.168], [0.25, 0, 0]);
    }
    if (L.top === 'shirt') {
      const w = M('#FAFAF7');
      for (const s of [-1, 1]) add(B, new THREE.ConeGeometry(0.05, 0.1, 3), w, [s * 0.06, 0.58, 0.14], [-0.5, 0, s * 2.4]);
      for (let i = 0; i < 3; i++) add(B, new THREE.SphereGeometry(0.012, 6, 5), w, [0, 0.5 - i * 0.09, 0.17 + (i === 2 ? 0.005 : 0)]);
    }
    if (L.top === 'jacket') {
      // 과잠: 가슴 패치, 밑단은 소품 색
      const patch = add(B, new THREE.CircleGeometry(0.05, 20), new THREE.MeshStandardMaterial({ map: stickerTex }), [0.085, 0.46, 0.166], [-0.1, 0.42, 0]);
      patch.castShadow = false;
      add(B, new THREE.TorusGeometry(0.168, 0.022, 6, 28), acc, [0, 0.14, 0], [PI / 2, 0, 0]);
      add(B, new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), M('#FAFAF7'), [0, 0.36, 0.172]);
    }

    if (L.top === 'jersey') {
      // 축구 유니폼: 등번호와 가슴 번호(몸통 곡면을 따라 붙인다), 둥근 깃
      const num = new THREE.MeshStandardMaterial({ map: numberTex(), transparent: true, alphaTest: 0.35, roughness: 0.85 });
      const back = add(B, new THREE.CylinderGeometry(0.194, 0.194, 0.17, 18, 1, true, PI - 0.46, 0.92), num, [0, 0.37, 0], [0, 0, 0], [1, 1, 0.9]);
      const front = add(B, new THREE.CylinderGeometry(0.193, 0.193, 0.075, 10, 1, true, 0.22, 0.42), num, [0, 0.405, 0], [0, 0, 0], [1, 1, 0.9]);
      back.castShadow = front.castShadow = false;
      add(B, new THREE.TorusGeometry(0.1, 0.018, 8, 28), M(L.accent), [0, 0.6, 0], [PI / 2, 0, 0]);
    }

    // 목
    if (L.neck === 'scarf') {
      add(B, new THREE.TorusGeometry(0.16, 0.06, 10, 24), acc, [0, 0.6, 0], [PI / 2, 0, 0]);
      add(B, new RoundedBoxGeometry(0.08, 0.2, 0.04, 1, 0.015), acc, [0.08, 0.5, 0.17], [0, 0, 0.12]);
    }
    if (L.neck === 'bow') {
      for (const s of [-1, 1]) add(B, new THREE.ConeGeometry(0.045, 0.08, 10), acc, [s * 0.045, 0.6, 0.165], [0, 0, (s * PI) / 2]);
      add(B, new THREE.SphereGeometry(0.024, 8, 6), acc, [0, 0.6, 0.17]);
    }

    // 가방
    if (L.bag === 'backpack') {
      add(B, new RoundedBoxGeometry(0.28, 0.3, 0.13, 2, 0.045), acc, [0, 0.4, -0.22]);
      add(B, new RoundedBoxGeometry(0.2, 0.12, 0.05, 2, 0.02), M(L.accent === '#2B2422' ? '#555' : '#2F3237'), [0, 0.33, -0.29]);
      for (const s of [-1, 1]) add(B, new THREE.TorusGeometry(0.13, 0.014, 6, 16, PI), acc, [s * 0.12, 0.47, -0.04], [0, PI / 2, 0]);
    }
    if (L.bag === 'cross') {
      const strap = new THREE.Group();
      strap.position.y = 0.38;
      strap.rotation.z = 0.75;
      B.add(strap);
      add(strap, new THREE.TorusGeometry(0.2, 0.013, 6, 32), M('#5A3A2A'), [0, 0, 0], [PI / 2, 0, 0], [1, 1, 0.92]);
      add(B, new RoundedBoxGeometry(0.17, 0.16, 0.07, 2, 0.025), acc, [0.17, 0.22, 0.08], [0, -0.7, 0]);
    }

    this.faceKey = '';
  }

  resetTargets() {
    const T = this.T;
    T.poseY = 0;
    T.poseZ = 0;
    T.poseRX = 0;
    T.bodyY = 0;
    T.bodyRX = 0;
    T.bodyRY = 0;
    T.bodyRZ = 0;
    T.headRX = 0;
    T.headRY = 0;
    T.headRZ = 0;
    T.aAx = 0;
    T.aAz = -0.3;
    T.aBx = 0;
    T.aBz = 0.3;
    T.fAy = 0.05;
    T.fAz = 0.03;
    T.fBy = 0.05;
    T.fBz = 0.03;
    T.fX = 0.1;
    T.squash = 1;
  }

  // s: { t, moving, air, st, seat, act, dn, emote, emoteT, kick, hitT, twirl }
  update(dt, s) {
    const t = s.t;
    const T = this.T;
    this.resetTargets();
    let face = 'normal';
    let spin = false;
    const show = { cup: false, gun: false, book: false, sketch: false, pencil: false, laptop: false };

    T.squash = 1 + Math.sin(t * 2.2 + this.phase * 0.1) * 0.012;

    if (s.st === 1) {
      const seatY = s.seat ? s.seat.y : 0.3;
      T.poseY = seatY - 0.07;
      T.fAy = T.fBy = -0.11;
      T.fAz = T.fBz = 0.22;
      T.aAx = T.aBx = -0.55;
      T.aAz = -0.04;
      T.aBz = 0.04;
    } else if (s.st === 2) {
      T.poseY = (s.seat ? s.seat.y : 0.3) - 0.04;
      T.poseRX = -1.15;
      T.poseZ = 0.22;
      T.fAy = T.fBy = 0.0;
      T.fAz = T.fBz = 0.1;
      T.aAz = -0.6;
      T.aBz = 0.6;
      T.aAx = T.aBx = 0.15;
      face = 'sleep';
    } else if (s.air) {
      T.aAz = -1.1;
      T.aBz = 1.1;
      T.aAx = T.aBx = -0.25;
      T.fAy = 0.13;
      T.fBy = 0.1;
      T.fAz = 0.08;
      T.fBz = -0.02;
    } else if (s.moving) {
      const run = s.moving === 2;
      this.phase += dt * (run ? 15 : 10.5);
      const p = this.phase;
      const sp = Math.sin(p);
      const amp = run ? 0.95 : 0.6;
      const stride = run ? 0.15 : 0.1;
      T.fAz = 0.03 + sp * stride;
      T.fBz = 0.03 - sp * stride;
      T.fAy = 0.05 + Math.max(0, Math.cos(p)) * 0.06;
      T.fBy = 0.05 + Math.max(0, -Math.cos(p)) * 0.06;
      T.aAx = sp * amp;
      T.aBx = -sp * amp;
      T.bodyY = Math.abs(sp) * (run ? 0.06 : 0.035);
      T.bodyRX = run ? 0.2 : 0.07;
      T.headRX = -T.bodyRX * 0.5;
    }

    // 하고 있는 일
    const act = s.act;
    if (act === 'laptop' && s.st === 1) {
      show.laptop = !(s.seat && s.seat.pc);
      T.aAx = -1.15 + Math.sin(t * 17) * 0.07;
      T.aBx = -1.15 + Math.sin(t * 17 + 1.7) * 0.07;
      T.aAz = 0.14;
      T.aBz = -0.14;
      T.headRX = 0.14;
      face = 'normal';
    } else if (act === 'book') {
      show.book = true;
      T.aAx = T.aBx = s.st === 2 ? -1.3 : -1.0;
      T.aAz = 0.32;
      T.aBz = -0.32;
      T.headRX = s.st === 2 ? 0 : 0.2;
      face = 'normal';
    } else if (act === 'draw') {
      show.sketch = true;
      show.pencil = true;
      T.aBx = -1.0;
      T.aBz = -0.18;
      T.aAx = -1.15 + Math.sin(t * 9) * 0.12;
      T.aAz = 0.22 + Math.cos(t * 9) * 0.1;
      T.headRX = 0.22;
      if (s.st === 2) face = 'normal';
    } else if (act === 'board') {
      show.pencil = true;
      T.aAx = -1.9 + Math.sin(t * 6) * 0.15;
      T.aAz = 0.1 + Math.cos(t * 6) * 0.12;
      T.headRX = -0.12;
    } else if (act === 'dance') {
      face = 'happy';
      spin = this.dance(T, s.dn || 0, t);
    } else if (act === 'gun') {
      show.gun = true;
      T.aAx = -1.45 + (s.kick || 0) * 0.6;
      T.aAz = 0.05;
    } else if (act === 'coffee') {
      // 커피를 들고 걷는다 (과장부터 보고하러 올 때)
      show.cup = true;
      T.aAx = -1.15;
      T.aAz = 0.28;
    }

    // 잠깐 하는 표현
    if (s.emote && s.emoteT < (EMOTE_DUR[s.emote] || 1.5)) {
      const k = s.emoteT;
      if (s.emote === 'wave') {
        T.aBz = 2.55 + Math.sin(k * 16) * 0.35;
        T.aBx = -0.15;
        T.headRZ = -0.12;
        face = 'happy';
      } else if (s.emote === 'heart') {
        T.aAx = T.aBx = -1.25;
        T.aAz = 0.5;
        T.aBz = -0.5;
        T.bodyY += Math.abs(Math.sin(k * 6)) * 0.03;
        face = 'happy';
      } else if (s.emote === 'sip') {
        show.cup = true;
        T.aAx = -2.25;
        T.aAz = 0.5;
        T.headRX = -0.18;
        if (s.st !== 2) face = k > 0.4 && k < 1.1 ? 'blink' : 'normal';
      } else if (s.emote === 'salute') {
        // 경례 (부장부터 보고할 때): 오른손 끝을 이마에 붙이고 반듯하게
        T.aBx = -0.95;
        T.aBz = 2.08;
        T.aAx = 0.05;
        T.aAz = 0.04;
        T.headRX = -0.06;
        face = 'normal';
      } else if (s.emote === 'boom') {
        T.aAz = -2.6;
        T.aBz = 2.6;
        face = 'happy';
      }
    }

    // 종이 총알에 맞았을 때
    if (s.hitT != null && s.hitT < 0.45) {
      const k = s.hitT / 0.45;
      T.squash = 0.8 + 0.2 * k;
      T.headRZ += Math.sin(s.hitT * 40) * 0.2 * (1 - k);
      face = 'wow';
    }

    // 눈 깜빡임
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blinking = 0.12;
      this.blinkT = 2.4 + Math.random() * 3.2;
    }
    if (this.blinking > 0) {
      this.blinking -= dt;
      if (face === 'normal') face = 'blink';
    }

    // 값 따라가기
    const C = this.C;
    for (const key in T) C[key] = damp(C[key], T[key], 20, dt);

    this.pose.position.set(0, C.poseY, C.poseZ);
    this.pose.rotation.x = C.poseRX;
    if (spin) this.spinY += dt * 7;
    else {
      const target = Math.round(this.spinY / (PI * 2)) * PI * 2;
      this.spinY = damp(this.spinY, target, 8, dt);
    }
    this.pose.rotation.y = this.spinY + (s.twirl || 0) * PI * 2;
    this.body.position.y = C.bodyY;
    this.body.rotation.set(C.bodyRX, C.bodyRY, C.bodyRZ);
    this.body.scale.set(1 + (1 - C.squash) * 0.5, C.squash, 1 + (1 - C.squash) * 0.5);
    // 위에서 내려다보는 화면에서는 고개를 살짝 들어 얼굴이 보이게 한다 (눈높이에서 볼 때는 0)
    this.tilt = damp(this.tilt || 0, s.tilt || 0, 6, dt);
    this.head.rotation.set(C.headRX + this.tilt, C.headRY, C.headRZ);
    this.armA.pivot.rotation.set(C.aAx, 0, C.aAz);
    this.armB.pivot.rotation.set(C.aBx, 0, C.aBz);
    this.footA.position.set(-C.fX, C.fAy, C.fAz);
    this.footB.position.set(C.fX, C.fBy, C.fBz);
    // 다리: 옷 밑단 속 엉덩이에서 발까지 잇는다 (걸을 때, 앉을 때 발을 따라간다)
    for (const [leg, foot, sx] of [[this.legA, this.footA, -1], [this.legB, this.footB, 1]]) {
      _hip.set(sx * 0.085, C.bodyY + 0.24, 0);
      _dir.copy(foot.position).sub(_hip);
      const len = _dir.length() || 0.001;
      leg.position.copy(_hip);
      leg.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len));
      leg.scale.set(1, len, 1);
    }

    if (this.tail) {
      const sw = s.moving ? Math.sin(this.phase) * (s.moving === 2 ? 0.38 : 0.24) : Math.sin(t * 1.7) * 0.05;
      this.tail.rotation.set(0.42 + (s.moving ? Math.abs(sw) * 0.5 : 0) + (s.air ? -0.5 : 0) + (act === 'dance' ? Math.sin(t * 7) * 0.3 : 0), 0, sw);
    }
    if (this.snot) this.snot.scale.setScalar(0.6 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.5)));
    if (this.ahoge) this.ahoge.rotation.z = Math.sin(t * 2.3) * 0.1 + (s.moving ? Math.sin(this.phase * 2) * 0.12 : 0);

    this.cup.visible = show.cup;
    if (show.cup) this.cup.rotation.x = -C.aAx;
    this.gun.visible = show.gun;
    this.pencil.visible = show.pencil;
    this.sketch.visible = show.sketch;
    this.book.visible = show.book;
    this.laptop.visible = show.laptop;
    if (show.laptop) {
      const seat = s.seat;
      if (seat && seat.tableY) {
        this.laptop.position.set(0, seat.tableY + 0.001, seat.lapZ || 0.62);
        this.laptop.rotation.x = 0;
      } else {
        this.laptop.position.set(0, C.poseY + 0.2, 0.24);
        this.laptop.rotation.x = -0.12;
      }
    }

    const key = this.look.face + '|' + face;
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawFace(this.faceCtx, this.look.face, face, this.faceKind, this.noseColor, this.eyeRim, this.look.eyes, this.lidColor);
      this.faceTex.needsUpdate = true;
      if (this.muzzle) {
        const mm = face === 'happy' ? 'open' : face === 'sleep' ? 'o' : face === 'wow' ? 'wow' : this.look.face;
        drawMuzzle(this.muzCtx, mm, this.muzzle.light, this.muzzle.nose);
        this.muzTex.needsUpdate = true;
      }
    }
  }

  dance(T, dn, t) {
    const q = Math.floor(t * 4) % 4;
    switch (dn % 7) {
      case 0: // 통통
        T.poseY = Math.abs(Math.sin(t * 7)) * 0.12;
        T.aAz = -(0.6 + 0.5 * Math.sin(t * 7));
        T.aBz = 0.6 + 0.5 * Math.sin(t * 7);
        return false;
      case 1: // 파도
        T.aAz = -2.4 + Math.sin(t * 5) * 0.4;
        T.aBz = 2.4 + Math.sin(t * 5 + 1) * 0.4;
        T.bodyRZ = Math.sin(t * 2.5) * 0.18;
        T.headRZ = -T.bodyRZ * 0.6;
        return false;
      case 2: // 빙글빙글
        T.aAz = -1.4;
        T.aBz = 1.4;
        T.bodyY = Math.abs(Math.sin(t * 6)) * 0.05;
        return true;
      case 3: // 로봇
        T.aAx = [-1.57, 0, -1.57, 0][q];
        T.aBx = [0, -1.57, 0, -1.57][q];
        T.headRY = [0.4, 0, -0.4, 0][q];
        T.bodyRY = [0.1, 0, -0.1, 0][q];
        return false;
      case 4: // 디스코
        T.aBz = Math.floor(t * 2) % 2 ? 2.6 : 0.5;
        T.aBx = -0.2;
        T.aAz = -0.3;
        T.bodyRZ = Math.sin(t * 4) * 0.12;
        T.bodyY = Math.abs(Math.sin(t * 4)) * 0.04;
        return false;
      case 5: // 박수
        T.aAx = T.aBx = -1.2;
        T.aAz = 0.35 + Math.sin(t * 10) * 0.25;
        T.aBz = -0.35 - Math.sin(t * 10) * 0.25;
        T.bodyY = Math.abs(Math.sin(t * 5)) * 0.06;
        return false;
      default: // 셔플
        T.fAz = 0.03 + Math.sin(t * 8) * 0.15;
        T.fBz = 0.03 - Math.sin(t * 8) * 0.15;
        T.bodyY = Math.abs(Math.cos(t * 8)) * 0.05;
        T.aAx = Math.sin(t * 8) * 0.8;
        T.aBx = -Math.sin(t * 8) * 0.8;
        return false;
    }
  }

  labelAnchor(v) {
    this.head.getWorldPosition(v);
    v.y += 0.47;
    return v;
  }

  setVisible(on) {
    this.pose.visible = on;
  }

  dispose() {
    this.root.parent?.remove(this.root);
    // 이 캐릭터만 쓰던 도형과 재료를 모두 내놓는다 (컵, 책, 노트북 같은 소품까지).
    // 여럿이 같이 쓰는 몸통 도형(G), 그림자, 색 재료(M)는 남긴다. 안 그러면 에이전트가 드나들 때마다 그래픽 메모리가 조금씩 샌다
    const sharedGeo = new Set([...Object.values(G), BLOB_GEO]);
    const sharedMat = new Set([...mats.values(), ...shirtMats.values(), HIT_MAT, BLOB_MAT]);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry && !sharedGeo.has(o.geometry)) o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !sharedMat.has(m)) m.dispose();
    });
    for (const g of this.decoGeos) g.dispose();
    this.faceTex.dispose();
    this.muzTex.dispose();
    this.faceMesh.material.dispose();
    this.bookCover.dispose();
  }
}
