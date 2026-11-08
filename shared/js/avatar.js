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
  torso: new THREE.CapsuleGeometry(0.19, 0.16, 6, 18),
  arm: new THREE.CapsuleGeometry(0.056, 0.12, 4, 10),
  hand: new THREE.SphereGeometry(0.064, 12, 10),
  foot: new THREE.SphereGeometry(0.085, 14, 10),
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

let laptopScreenTex = null;
let stickerTex = null;
function sharedTextures() {
  if (!laptopScreenTex) laptopScreenTex = codeScreenTexture(77, 192, 128);
  if (!stickerTex)
    stickerTex = canvasTex(128, 128, (g, w, h) => drawMark(g, w / 2, h / 2, w / 2 - 4));
}

// ---------- 얼굴 ----------
const INK = '#2A2320';
function drawFace(g, expr, mode) {
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,120,140,.30)';
  for (const x of [60, 196]) {
    g.beginPath();
    g.ellipse(x, 152, 22, 13, 0, 0, PI * 2);
    g.fill();
  }
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = 7;
  const dot = (x, y, big = 1) => {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x, y, 12 * big, 16 * big, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(x + 4 * big, y - 6 * big, 4.2 * big, 0, PI * 2);
    g.fill();
  };
  const happy = (x, y) => {
    g.beginPath();
    g.arc(x, y + 8, 13, PI * 1.15, PI * 1.85);
    g.stroke();
  };
  const closed = (x, y) => {
    g.beginPath();
    g.arc(x, y - 8, 13, PI * 0.15, PI * 0.85);
    g.stroke();
  };
  const halfOpen = (x, y) => {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x, y + 2, 12, 11, 0, 0, PI);
    g.fill();
    g.beginPath();
    g.moveTo(x - 15, y + 1);
    g.lineTo(x + 15, y + 1);
    g.stroke();
  };
  const L = 88;
  const Rx = 168;
  const EY = 118;
  // 눈
  if (mode === 'blink') {
    for (const x of [L, Rx]) {
      g.beginPath();
      g.moveTo(x - 12, EY + 2);
      g.lineTo(x + 12, EY + 2);
      g.stroke();
    }
  } else if (mode === 'happy') {
    happy(L, EY);
    happy(Rx, EY);
  } else if (mode === 'sleep') {
    closed(L, EY);
    closed(Rx, EY);
  } else if (mode === 'wow' || expr === 'wow') {
    dot(L, EY, 1.18);
    dot(Rx, EY, 1.18);
  } else if (expr === 'wink') {
    dot(L, EY);
    happy(Rx, EY);
  } else if (expr === 'blank') {
    // 멍: 작은 점 눈이 살짝 멀리
    g.fillStyle = INK;
    for (const x of [L - 6, Rx + 6]) {
      g.beginPath();
      g.arc(x, EY + 4, 6.5, 0, PI * 2);
      g.fill();
    }
  } else if (expr === 'tongue') {
    dot(L, EY);
    happy(Rx, EY);
  } else if (expr === 'uneven') {
    // 짝눈: 한쪽은 크고 한쪽은 작게
    dot(L, EY + 3, 1.35);
    dot(Rx, EY - 5, 0.6);
  } else if (expr === 'sleepy') {
    halfOpen(L, EY);
    halfOpen(Rx, EY);
  } else if (expr === 'calm') {
    dot(L, EY, 0.85);
    dot(Rx, EY, 0.85);
  } else {
    dot(L, EY);
    dot(Rx, EY);
  }
  // 입
  g.fillStyle = INK;
  g.lineWidth = 6;
  const m = mode === 'happy' ? 'open' : mode === 'sleep' ? 'o' : mode === 'wow' ? 'wow' : expr;
  if (m === 'open') {
    g.beginPath();
    g.arc(128, 156, 19, 0, PI);
    g.closePath();
    g.fill();
    g.fillStyle = '#F2788C';
    g.beginPath();
    g.arc(128, 166, 9, 0, PI);
    g.fill();
  } else if (m === 'cat') {
    g.beginPath();
    g.arc(117, 158, 11, PI * 0.1, PI * 0.9);
    g.stroke();
    g.beginPath();
    g.arc(139, 158, 11, PI * 0.1, PI * 0.9);
    g.stroke();
  } else if (m === 'wow') {
    g.beginPath();
    g.ellipse(128, 168, 10, 13, 0, 0, PI * 2);
    g.fill();
  } else if (m === 'calm') {
    g.beginPath();
    g.moveTo(115, 166);
    g.lineTo(141, 166);
    g.stroke();
  } else if (m === 'tongue') {
    g.beginPath();
    g.arc(128, 150, 19, PI * 0.18, PI * 0.82);
    g.stroke();
    g.fillStyle = '#F2788C';
    g.beginPath();
    g.ellipse(134, 172, 10, 13, 0.2, 0, PI * 2);
    g.fill();
    g.strokeStyle = '#D9566C';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(134, 164);
    g.lineTo(135, 178);
    g.stroke();
  } else if (m === 'uneven') {
    g.beginPath();
    g.moveTo(110, 166);
    g.bezierCurveTo(118, 158, 124, 174, 132, 166);
    g.bezierCurveTo(138, 159, 144, 170, 148, 164);
    g.stroke();
  } else if (m === 'blank') {
    g.beginPath();
    g.ellipse(133, 170, 5, 4.5, 0, 0, PI * 2);
    g.stroke();
  } else if (m === 'sleepy' || m === 'o') {
    g.beginPath();
    g.ellipse(128, 166, 7, 6, 0, 0, PI * 2);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(128, 150, 19, PI * 0.18, PI * 0.82);
    g.stroke();
  }
}

// 동작 길이(초)
export const EMOTE_DUR = { wave: 1.7, heart: 1.8, sip: 1.5, boom: 0.9 };

export class Avatar {
  constructor(look, { shadow = true } = {}) {
    sharedTextures();
    this.root = new THREE.Group();
    this.pose = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.pose);
    this.pose.add(this.body);
    this.shadow = shadow;

    this.torso = this.mesh(G.torso, null, this.body);
    this.torso.position.y = 0.36;
    this.torso.scale.set(1, 1, 0.9);

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
    for (const f of [this.footA, this.footB]) f.scale.set(1, 0.6, 1.35);

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
    sleeve.position.y = -0.1;
    const hand = this.mesh(G.hand, null, pivot);
    hand.position.y = -0.225;
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
    const skin = M(L.skin);
    this.headMesh.material = skin;
    this.armA.hand.material = this.armB.hand.material = skin;
    this.torso.material = M(L.cloth);
    const sleeve = L.top === 'jacket' ? M('#F3E9D2') : M(L.cloth);
    this.armA.sleeve.material = this.armB.sleeve.material = sleeve;

    for (const g of this.decoGeos) g.dispose();
    this.decoGeos = [];
    this.headDeco.clear();
    this.bodyDeco.clear();
    this.tail = null;
    this.snot = null;
    this.ahoge = null;

    const hairM = M(L.hairColor);
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

    // 머리카락
    const cap = () => add(H, new THREE.SphereGeometry(0.318, 32, 16, 0, PI * 2, 0, 1.25), hairM, [0, 0, 0], [-0.35, 0, 0]);
    if (L.hair === 'short') cap();
    if (L.hair === 'bob') {
      cap();
      const shell = new THREE.SphereGeometry(0.33, 32, 16, PI / 2 + 1.05, PI * 2 - 2.1, 0.5, 1.55);
      add(H, shell, M(L.hairColor, { side: THREE.DoubleSide }));
    }
    if (L.hair === 'bun') {
      cap();
      add(H, new THREE.SphereGeometry(0.12, 16, 12), hairM, [0, 0.31, -0.1]);
    }
    if (L.hair === 'ponytail') {
      cap();
      const tail = new THREE.Group();
      tail.position.set(0, 0.13, -0.27);
      H.add(tail);
      add(tail, new THREE.TorusGeometry(0.045, 0.02, 8, 16), acc, [0, 0, 0], [PI / 2 - 0.4, 0, 0]);
      add(tail, new THREE.SphereGeometry(0.1, 16, 12), hairM, [0, -0.15, -0.02], [0, 0, 0], [0.8, 1.75, 0.8]);
      add(tail, new THREE.SphereGeometry(0.06, 12, 10), hairM, [0, -0.31, -0.03], [0, 0, 0], [0.9, 1.2, 0.9]);
      this.tail = tail;
    }
    if (L.hair === 'bowl') {
      add(H, new THREE.SphereGeometry(0.327, 32, 16, 0, PI * 2, 0, 1.49), hairM);
      add(H, new THREE.TorusGeometry(0.327 * Math.sin(1.49), 0.012, 6, 40), hairM, [0, 0.327 * Math.cos(1.49), 0], [PI / 2, 0, 0]);
    }
    if (L.hair === 'curly') {
      cap();
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
    const ex = 0.078;
    const ey = -0.016;
    const ez = 0.3;
    if (L.glasses === 'round' || L.glasses === 'square') {
      for (const s of [-1, 1]) {
        const ring = L.glasses === 'round' ? new THREE.TorusGeometry(0.058, 0.011, 8, 24) : new THREE.TorusGeometry(0.066, 0.011, 6, 4);
        add(H, ring, dark, [s * ex, ey, ez], [0, s * 0.22, L.glasses === 'square' ? PI / 4 : 0]);
      }
      add(H, new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6), dark, [0, ey + 0.01, ez + 0.012], [0, 0, PI / 2]);
    }
    if (L.glasses === 'sun') {
      const lens = M('#1D1D22', { roughness: 0.2, metalness: 0.4 });
      for (const s of [-1, 1]) add(H, new THREE.CylinderGeometry(0.066, 0.066, 0.014, 24), lens, [s * ex, ey, ez], [PI / 2, 0, -s * 0.22], [1, 1, 0.85]);
      add(H, new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), dark, [0, ey + 0.01, ez + 0.01], [0, 0, PI / 2]);
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
    T.aAz = -0.12;
    T.aBx = 0;
    T.aBz = 0.12;
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
    this.head.rotation.set(C.headRX, C.headRY, C.headRZ);
    this.armA.pivot.rotation.set(C.aAx, 0, C.aAz);
    this.armB.pivot.rotation.set(C.aBx, 0, C.aBz);
    this.footA.position.set(-C.fX, C.fAy, C.fAz);
    this.footB.position.set(C.fX, C.fBy, C.fBz);

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
      drawFace(this.faceCtx, this.look.face, face);
      this.faceTex.needsUpdate = true;
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
    for (const g of this.decoGeos) g.dispose();
    this.faceTex.dispose();
    this.faceMesh.material.dispose();
    this.bookCover.dispose();
  }
}
