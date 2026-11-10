// 에이전트 작업실: Orca, Claude, Codex에서 돌린 에이전트를 3D 캐릭터로 보여 주고,
// 일이 끝나면 내 캐릭터 옆으로 걸어와서 보고하게 한다. 나는 방향키로 돌아다닐 수 있다.
import * as THREE from 'three';
import { buildRoom } from '/js/room.js';
import { buildCafe } from '/js/cafe.js';
import { buildStadium } from '/js/stadium.js';
import { buildParis } from '/js/paris.js';
import { Avatar } from '/js/avatar.js';
import { Grid } from '/js/path.js';
import { FX } from '/js/fx.js';
import { canvasTex, rng, FONT_HAND, FONT_BODY } from '/js/tex.js';
import { LOOK_PARTS, PALETTE, SKINS, HAIR_COLORS, DANCES, normalizeLook } from '/js/config.js';
import { $, clamp, damp, angleDamp, esc, hashStr, fmtTime } from '/js/util.js';
import { setBrand, OFFICE_BRAND } from '/js/brand.js';
import * as UI from '/js/ui.js';
import { openEditor } from '/js/editor.js';
import { faceURL } from '/js/face.js';

// 동아리 흔적 없는 작업실로
setBrand(OFFICE_BRAND);
LOOK_PARTS.top.options.jacket = '과잠';

const PI = Math.PI;
const q = new URLSearchParams(location.search);
const TOKEN = q.get('t') || '';
const MINI = q.get('mode') === 'mini'; // 상단바에서 펼친 작은 창
if (MINI) document.body.classList.add('mini');
const ACTIVE = new Set(['working', 'monitoring']);
const ATTN = new Set(['waiting', 'blocked']);
const isBusy = (s) => ACTIVE.has(s) || ATTN.has(s);
const RECENT_MS = 12 * 3600 * 1000;

// 작업실 아이콘 (index.html 맨 위의 svg 묶음)
const ico = (n, cls = '') => `<svg class="i${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const kindIco = (k) => ico(k === 'attention' ? 'attn' : k === 'interrupted' ? 'pause' : 'done');

const api = (path, body) =>
  fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

await Promise.race([
  Promise.all([document.fonts.load('40px "Jua"'), document.fonts.load('20px "Pretendard Variable"')]).catch(() => {}),
  new Promise((r) => setTimeout(r, 1500)),
]);
let boot = {};
try {
  boot = await api('/api/state');
} catch {}
const settings = { bossName: '나', sound: true, hideResting: false, map: 'office', bossLook: null, ...(boot.settings || {}) };
const MAP_ID = ['cafe', 'stadium', 'paris'].includes(settings.map) ? settings.map : 'office';

// ---------- 맵 ----------
const LAYOUTS = {
  office: {
    build: (scene, o) => buildRoom(scene, { ...o, banner: { title: 'Agent Office', sub: '끝나면 보고하러 와요' } }),
    work: ['desk1', 'desk2', 'desk3', 'desk4', 't1', 't2', 't3', 't4', 't5', 't6', 't8', 'sA1', 'sA2', 'sA3', 'sA4', 'sB1', 'sB2', 'sB3', 'sB4'],
    lounge: [
      { seat: 'sofa1' }, { seat: 'sofa2' }, { seat: 'sofa3' }, { seat: 'bean1' }, { seat: 'bean2' },
      { x: 12.9, z: 1.75 }, { x: 12.3, z: 2.15 }, { x: 13.2, z: 8.7 }, { x: 12.4, z: 9.3 }, { x: 14.0, z: 9.25 }, { x: 11.6, z: 8.6 },
    ],
    boss: 't7',
    door: { x: 15.2, z: 10.8 },
  },
  cafe: {
    build: (scene, o) => buildCafe(scene, o),
    work: [
      'bar1', 'bar2', 'bar3', 'bar4', 'bar5', 'cnt1', 'cnt2', 'cnt3', 'cnt4', 'cnt5', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
      'c1w', 'c1e', 'c2w', 'c2e', 'c3w', 'c3e', 'c4e', 'c5w', 'c5e', 'c6w', 'c6e',
    ],
    lounge: [
      { seat: 'sofa1' }, { seat: 'sofa2' }, { seat: 'sofa3' }, { seat: 'arm1' }, { seat: 'arm2' },
      { x: 7.3, z: 2.7 }, { x: 9.6, z: 2.7 }, { x: 13.1, z: 11.0 }, { x: 10.8, z: 9.6 },
    ],
    boss: 'c4w',
    door: { x: 15.2, z: 10.9 },
  },
  // 축구장: 기자석(북쪽)과 벤치(남쪽)에서 일하고, 쉬는 에이전트는 그라운드에 나와 있다
  stadium: {
    build: (scene, o) => buildStadium(scene, o),
    work: ['pr1', 'pr2', 'pr3', 'pr4', 'pr5', 'pr6', 'pr7', 'pr8', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    lounge: [
      { x: 8.0, z: 5.1 }, { x: 7.0, z: 6.7 }, { x: 9.1, z: 6.6 }, { x: 4.4, z: 6.0 }, { x: 11.7, z: 5.6 },
      { x: 3.6, z: 4.4 }, { x: 12.6, z: 7.6 }, { x: 6.0, z: 4.1 }, { x: 10.3, z: 8.0 },
    ],
    boss: 'boss',
    door: { x: 13.6, z: 10.6 },
  },
  // 파리 (생제르맹 데프레 거리 배치): 카페 테라스에서 일하고, 공원 벤치와 보도에서 쉰다. 출근은 메트로로
  paris: {
    build: (scene, o) => buildParis(scene, o),
    work: [
      'fa1', 'fa2', 'fa3', 'fa4', 'fa5', 'fa6', 'ma1', 'ma2', 'ma3', 'ma4', 'ma5', 'ma6',
      'br1', 'br2', 'br3', 'br4', 'br5', 'br6', 'br7', 'br8', 'br9', 'br10', 'br11', 'br12',
    ],
    lounge: [
      { seat: 'sq1' }, { seat: 'sq2' },
      { x: 10.5, z: 6.35 }, { x: 12.0, z: 6.5 }, { x: 14.1, z: 6.45 }, { x: 9.3, z: 9.2 },
      { x: 12.9, z: 9.2 }, { x: 14.7, z: 9.3 }, { x: 4.2, z: 6.55 }, { x: 8.75, z: 6.45 },
    ],
    boss: 'boss',
    door: { x: 13.0, z: 6.62 },
  },
};
const LAYOUT = LAYOUTS[MAP_ID];

// 장면이 그려지는 상자 (작은 창에서는 위쪽 일부만 쓴다)
const viewBox = () => {
  const r = $('scene').getBoundingClientRect();
  return { x: r.left, y: r.top, w: Math.max(1, r.width), h: Math.max(1, r.height) };
};
let VB = viewBox();
// 창 크기나 작은 창의 배치가 바뀌면 장면을 그 상자에 다시 맞춘다
let sceneReady = false;
function fitScene() {
  if (!sceneReady) return;
  VB = viewBox();
  renderer.setSize(VB.w, VB.h);
  camera.aspect = VB.w / VB.h;
  camera.updateProjectionMatrix();
}

// ---------- 장면 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MINI ? 2 : 1.5)); // 큰 창은 1.5배까지만 (렉 방지)
renderer.setSize(VB.w, VB.h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // 그림자는 frame()에서 두 번에 한 번만 다시 그린다
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.domElement.id = 'stage';
$('scene').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, VB.w / VB.h, 0.05, 200);
scene.add(new THREE.HemisphereLight('#FFF8EE', '#9C8B7A', 1.7));
scene.add(new THREE.AmbientLight('#FFFFFF', 0.45));
const sun = new THREE.DirectionalLight('#FFF1DE', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 45 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// 화이트보드(카페에선 칠판)는 실시간 현황판
const statusTex = canvasTex(1280, 800, (g, w, h) => {
  g.fillStyle = '#FBFBF8';
  g.fillRect(0, 0, w, h);
});
const room = LAYOUT.build(scene, { boardTexture: statusTex });
const W = room.W;
const D = room.D;
sun.position.set(W / 2 - 7, 14, D / 2 + 5);
sun.target.position.set(W / 2, 0, D / 2);
const seatById = new Map(room.seats.map((s) => [s.id, s]));
const grid = new Grid(W, D, room.colliders);
const fx = new FX(scene);

const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const WORK_KEYS = LAYOUT.work.filter((k) => seatById.has(k));
const LOUNGE = LAYOUT.lounge.map((s, i) => (s.seat ? { key: s.seat, seat: s.seat } : { key: `p${i}`, ...s, h: toward(s.x, s.z, W / 2, D / 2) }));
const LOUNGE_KEYS = LOUNGE.map((s) => s.key);
const BOSS_SEAT = seatById.get(LAYOUT.boss);
const DOOR = LAYOUT.door;

// ---------- 이름표 ----------
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
let hoverId = null; // 마우스를 올린 에이전트 (이름표에 하는 일을 펼친다)
// 이름표는 머리줄 아래에서 서서히 나타난다 (작은 창은 머리줄이 낮다)
const FADE0 = MINI ? 30 : 60;
const FADE1 = MINI ? 54 : 100;
// 이름표 한 알약: 상태 점(색은 CSS의 data-s) + 이름 + 허락이 필요할 때만 붙는 글. 하는 일(sub)은 마우스를 올렸을 때 펼친다
function makeLabel(kind) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<div class="bub" hidden></div><div class="tag ${kind}"><span class="ico"></span><span class="rk"></span><span class="nm"></span><span class="st"></span></div><div class="sub"></div>`;
  $('labels').appendChild(el);
  if (kind === 'boss') el.querySelector('.rk').textContent = '사장님';
  return { el, tag: el.querySelector('.tag'), bub: el.querySelector('.bub'), ico: el.querySelector('.ico'), rk: el.querySelector('.rk'), nm: el.querySelector('.nm'), st: el.querySelector('.st'), sub: el.querySelector('.sub'), vis: null, bubUntil: 0 };
}
function place(lbl, x, y, z) {
  _v.set(x, y, z).project(camera);
  const vis = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15;
  const sy = (-_v.y * 0.5 + 0.5) * VB.h;
  if (vis) {
    // 위치가 그대로면 건드리지 않는다 (0.5px 단위로 맞춰서 쓸데없는 다시 그리기를 줄인다)
    const tf = `translate(${Math.round((_v.x * 0.5 + 0.5) * VB.w * 2) / 2}px, ${Math.round(sy * 2) / 2}px) translate(-50%, -100%)`;
    if (lbl.tf !== tf) {
      lbl.tf = tf;
      lbl.el.style.transform = tf;
    }
  }
  // 머리줄 아래에서 서서히 나타나게 (이름표 아래 끝이 머리줄 안이면 흐리게)
  const op = sy < FADE1 ? Math.max(0, Math.min(1, (sy - FADE0) / (FADE1 - FADE0))) : 1;
  if (lbl.op !== op) {
    lbl.op = op;
    lbl.el.style.opacity = op;
  }
  if (lbl.vis !== vis) {
    lbl.vis = vis;
    lbl.el.style.visibility = vis ? 'visible' : 'hidden';
  }
}
const setText = (el, key, obj, text) => {
  if (obj[key] === text) return;
  obj[key] = text;
  el.textContent = text;
};
function showBubble(lbl, text, cls, ms) {
  lbl.bub.textContent = text;
  lbl.bub.className = 'bub ' + (cls || '');
  lbl.bub.hidden = false;
  lbl.bubUntil = performance.now() + ms;
}
function popEmoji(lbl, emoji, n = 1) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'pop';
    s.textContent = emoji;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
    s.style.animationDelay = `${i * 0.13}s`;
    lbl.el.appendChild(s);
    setTimeout(() => s.remove(), 1800 + i * 130);
  }
}

// ---------- 자리 ----------
// ---------- 충성도와 직급 (점수는 서버의 staff.js가 매긴다) ----------
// 내가 붙인 에이전트 이름 (없으면 원래 작업 이름). 저장하자마자 보이게 nameNow로 먼저 반영한다
const nameNow = {};
const nickOf = (id) => (id in nameNow ? nameNow[id] : settings.agentNames?.[id]) || '';
const nameOf = (d) => nickOf(d?.id) || d?.name || '에이전트';
const RANK_NAMES = ['인턴', '사원', '대리', '과장', '부장', '오른팔'];
const RANK_AT = [0, 20, 40, 60, 80, 95];
const staffOfAgent = (d) => (d?.staffKey && lastState.staff?.[d.staffKey]) || null;
const rankOfAgent = (d) => staffOfAgent(d)?.rank ?? 0;
const ro = (w) => {
  // 받침이 있으면 '으로', 없거나 ㄹ이면 '로'
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  const jong = c >= 0 && c < 11172 ? c % 28 : 0;
  return w + (jong && jong !== 8 ? '으로' : '로');
};
// 오른팔은 내 자리에서 가까운 책상부터 앉는다
const seatDist = (k) => {
  const st = seatById.get(k);
  return BOSS_SEAT && st ? Math.hypot(st.x - BOSS_SEAT.x, st.z - BOSS_SEAT.z) : 0;
};
const NEAR_BOSS = WORK_KEYS.filter((k) => k !== LAYOUT.boss).sort((p, q) => seatDist(p) - seatDist(q));

const used = new Map(); // 자리 → 에이전트 id ('me'는 나)
function releaseAll(id) {
  for (const [k, who] of used) if (who === id) used.delete(k);
}
function claim(keys, id, prefer = 0) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[(i + prefer) % keys.length];
    const who = used.get(k);
    if (!who || who === id) {
      releaseAll(id);
      used.set(k, id);
      return k;
    }
  }
  return null;
}

// ---------- 충돌 ----------
const R_BODY = 0.26;
function collide(x, z) {
  for (let it = 0; it < 3; it++) {
    x = clamp(x, R_BODY, W - R_BODY);
    z = clamp(z, R_BODY, D - R_BODY);
    for (const b of room.colliders) {
      const cx = clamp(x, b.x0, b.x1);
      const cz = clamp(z, b.z0, b.z1);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R_BODY * R_BODY) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x += (dx / d) * (R_BODY - d);
        z += (dz / d) * (R_BODY - d);
      } else {
        const l = x - b.x0;
        const r = b.x1 - x;
        const t = z - b.z0;
        const bt = b.z1 - z;
        const m = Math.min(l, r, t, bt);
        if (m === l) x = b.x0 - R_BODY;
        else if (m === r) x = b.x1 + R_BODY;
        else if (m === t) z = b.z0 - R_BODY;
        else z = b.z1 + R_BODY;
      }
    }
  }
  return [x, z];
}
function blockedAt(x, z) {
  if (x < 0.03 || z < 0.03 || x > W - 0.03 || z > D - 0.03) return true;
  for (const b of room.colliders) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}

// ---------- 나 ----------
const BOSS_DEFAULT = {
  skin: '#FFE6D2', hairColor: '#2B2422', cloth: '#28366B', accent: '#FF8A3D',
  hair: 'short', hat: 'crown', face: 'smile', glasses: 'none', top: 'jacket', neck: 'none', bag: 'none',
};
let bossLook = normalizeLook(settings.bossLook || BOSS_DEFAULT);
const me = {
  av: new Avatar(bossLook, { shadow: false, blob: true }),
  lbl: makeLabel('boss'),
  x: BOSS_SEAT.x,
  z: BOSS_SEAT.z,
  y: 0,
  vy: 0,
  h: BOSS_SEAT.h,
  jumps: 0,
  twirlT: 9,
  moving: 0,
  st: BOSS_SEAT.kind === 'bean' ? 2 : 1,
  seat: BOSS_SEAT,
  act: 'laptop',
  dn: 0,
  emote: '',
  emoteT: 9,
  kick: 0,
  hitT: 9,
  fireCd: 0,
};
used.set(BOSS_SEAT.id, 'me');
scene.add(me.av.root);
me.lbl.nm.textContent = settings.bossName || '나';

function meSit(seat) {
  const who = used.get(seat.id);
  if (who && who !== 'me') return UI.toast('누가 앉아 있어요', '다른 자리를 찾아봐요.', 1800);
  releaseAll('me');
  used.set(seat.id, 'me');
  Object.assign(me, { st: seat.kind === 'bean' ? 2 : 1, seat, x: seat.x, z: seat.z, h: seat.h, y: 0, vy: 0 });
  me.act = me.act === 'gun' ? 'gun' : seat.tableY ? 'laptop' : '';
}
function meStand() {
  if (!me.st) return;
  const s = me.seat;
  const d = s.kind === 'chair' ? -0.62 : s.kind === 'bean' ? 0.85 : 0.62;
  [me.x, me.z] = collide(s.x + Math.sin(s.h) * d, s.z + Math.cos(s.h) * d);
  me.st = 0;
  me.seat = null;
  releaseAll('me');
  if (me.act === 'laptop') me.act = '';
}
function emote(name) {
  me.emote = name;
  me.emoteT = 0;
  if (name === 'heart') {
    popEmoji(me.lbl, '💗', 5);
    for (const a of agents.values())
      if (a.role !== 'leave' && Math.hypot(a.x - me.x, a.z - me.z) < 2.6) {
        popEmoji(a.lbl, '💗', 1);
        if (a.data.staffKey) api('/api/loyalty', { id: a.id, ev: 'heart' });
      }
  }
  if (name === 'wave') popEmoji(me.lbl, '👋', 1);
}
function jump() {
  if (me.st) meStand();
  if (me.y <= 0.001 && me.vy <= 0) {
    me.vy = 6.2;
    me.jumps = 1;
  } else if (me.jumps < 2) {
    me.vy = 5.6;
    me.jumps = 2;
    me.twirlT = 0;
  }
}
function toggleDance() {
  if (me.act === 'dance') {
    me.act = '';
    return;
  }
  if (me.st) meStand();
  let dn = me.dn;
  while (dn === me.dn) dn = Math.floor(Math.random() * DANCES.length);
  me.dn = dn;
  me.act = 'dance';
  UI.toast(DANCES[dn], '3을 다시 누르거나 움직이면 멈춰요.', 1800);
}
function firecracker() {
  fx.burst(me.x, me.y + 1.45, me.z);
  emote('boom');
}
function toggleGun() {
  if (me.act === 'gun') {
    me.act = me.st && me.seat?.tableY ? 'laptop' : '';
    UI.toast('종이 총을 넣었어요', '', 1300);
  } else {
    me.act = 'gun';
    UI.toast('종이 총을 꺼냈어요', MINI ? '클릭이나 F로 발사! G로 넣어요.' : '클릭이나 F로 발사! 에이전트를 맞혀 봐요. G로 넣어요.', 2200);
  }
}
function fire() {
  if (me.act !== 'gun' || me.fireCd > 0) return;
  me.fireCd = 0.18;
  me.kick = 1;
  fx.shoot(me.x + Math.sin(me.h) * 0.42, me.y + (me.st ? 0.75 : 0.56), me.z + Math.cos(me.h) * 0.42, me.h, 'me');
}
function hitTest(x, y, z, owner) {
  for (const a of agents.values()) {
    if (a.id === owner) continue;
    if (y < 1.25 && Math.hypot(a.x - x, a.z - z) < 0.34) {
      a.hitT = 0;
      popEmoji(a.lbl, '💥', 1);
      if (owner === 'me' && a.data.staffKey) api('/api/loyalty', { id: a.id, ev: 'shot' });
      return a.id;
    }
  }
  return null;
}

// F: 앉기, 일어나기, 발사, 가까운 에이전트 보기
let curAct = null;
let actKey = '';
function nearestAct() {
  if (FK.on) return null;
  if (me.act === 'gun') return { kind: 'fire', label: '종이 총 발사' };
  if (me.st) return { kind: 'stand', label: '일어나기' };
  if (room.ball && room.ball.near(me.x, me.z) < 0.75) return { kind: 'kick', label: '공 차기' }; // 축구장 공
  let best = null;
  let bd = Infinity;
  for (const s of room.seats) {
    const who = used.get(s.id);
    if (who && who !== 'me') continue;
    const d = Math.hypot(s.x - me.x, s.z - me.z);
    if (d < (s.kind === 'bean' ? 1.0 : 0.85) && d < bd) {
      bd = d;
      best = { kind: 'seat', seat: s, label: s.kind === 'bean' ? '빈백에 눕기' : '앉기' };
    }
  }
  for (const a of agents.values()) {
    const d = Math.hypot(a.x - me.x, a.z - me.z) + 0.1;
    if (d < 1.4 && d < bd) {
      bd = d;
      best = { kind: 'agent', agent: a, label: `${short(nameOf(a.data), 12)} 보기` };
    }
  }
  // 문 앞: 다른 맵으로
  const door = room.spots.find((s) => s.kind === 'door');
  if (door) {
    const d = Math.hypot(door.x - me.x, door.z - me.z);
    if (d < 1.1 && d < bd) best = { kind: 'door', label: '맵 이동하기' };
  }
  return best;
}
function interact() {
  const it = curAct;
  if (!it) return;
  if (it.kind === 'fire') fire();
  else if (it.kind === 'stand') meStand();
  else if (it.kind === 'seat') meSit(it.seat);
  else if (it.kind === 'kick') kickBall();
  else if (it.kind === 'door') toggleDoor(true);
  else if (it.kind === 'agent') {
    const p = projectToScreen(it.agent.x, 1.2, it.agent.z);
    showCard({ agent: it.agent }, p.x, p.y);
  }
}
// 축구장 공 차기: Shift를 누르고 있으면 더 세게, 더 높이
function kickBall() {
  room.ball.kick(me.x, me.z, me.h, keys.has('ShiftLeft') || keys.has('ShiftRight') || runToggle);
  thump();
}
function thump() {
  if (!soundOn) return;
  try {
    actx = actx || new AudioContext();
    const t0 = actx.currentTime;
    const o = actx.createOscillator();
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.09);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + 0.18);
  } catch {}
}
if (room.ball)
  room.ball.onGoal = (side, x, z) => {
    if (FK.on) fkResult('goal');
    UI.toast('골!', FK.on ? 'K를 누르면 한 번 더 차요.' : '공은 곧 가운데로 돌아가요.', 2400);
    for (let i = 0; i < 5; i++) setTimeout(() => fx.burst(x + (Math.random() - 0.5) * 1.4, 1.1 + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.4, 40), i * 200);
    chime();
  };
// ---------- 축구장 프리킥 (K): 골대 앞에 공을 놓고, 노란 수비벽 마네킹과 골키퍼 앞에서 찬다 ----------
const FK = { on: false, phase: '', base: 0, aim: 0, hold: 0, charging: false, t: 0, shotAt: 0, touched: '', touchAt: 0, endAt: 0, dummies: [], dBodies: [], keeper: null, kBody: null, kx: 0, kz: 0, prevYaw: 0 };
const KEEPER_LOOK = normalizeLook({ skin: '#E8B48A', hairColor: '#2B2422', cloth: '#7CE34B', accent: '#1F2226', hair: 'short', hat: 'none', face: 'smile', glasses: 'none', top: 'jersey', neck: 'none', bag: 'none' });
const pingpong = (x) => 1 - Math.abs((x % 2) - 1);
// 공 앞에 깔리는 노란 화살표 (찰 방향)
const fkArrow = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: '#F2C230', transparent: true, opacity: 0.85, depthWrite: false });
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 2.1), m);
  shaft.rotation.x = -PI / 2;
  shaft.position.set(0, 0.006, 1.2);
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.11, 3), m);
  head.rotation.set(-PI / 2, 0, -PI / 2);
  head.position.set(0, 0.006, 2.28);
  fkArrow.add(shaft, head);
  fkArrow.visible = false;
  scene.add(fkArrow);
}
function makeDummy() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#F2C230', roughness: 0.6 });
  // 훈련용 낮은 마네킹 (크로스바보다 낮아서 넘겨 찰 수 있다)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.42, 16), mat);
  body.position.y = 0.26;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), mat);
  head.position.y = 0.56;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#2A2E36' }));
  base.position.y = 0.025;
  body.castShadow = head.castShadow = true;
  g.add(body, head, base);
  return g;
}
function setPower(p) {
  $('fkBar').querySelector('i').style.width = `${Math.round(p * 100)}%`;
}
function startFreeKick() {
  if (!room.ball || !room.pitch) return;
  if (FK.on) endFreeKick();
  if (me.st) meStand();
  if (me.act === 'dance' || me.act === 'gun') me.act = '';
  const g = room.pitch;
  const gx = g.x1; // 동쪽 골대
  const spot = { x: gx - (2.7 + Math.random() * 0.9), z: g.cz + (Math.random() - 0.5) * 2.6 };
  room.ball.place(spot.x, spot.z);
  FK.base = Math.atan2(gx - spot.x, g.cz - spot.z);
  FK.aim = 0;
  // 수비벽: 공에서 골대 쪽으로 1.5m, 가로로 셋
  const wx = spot.x + Math.sin(FK.base) * 1.5;
  const wz = spot.z + Math.cos(FK.base) * 1.5;
  const px = Math.cos(FK.base);
  const pz = -Math.sin(FK.base);
  for (let i = 0; i < 3; i++) {
    const d = makeDummy();
    const off = (i - 1) * 0.36;
    d.position.set(wx + px * off, 0, wz + pz * off);
    d.rotation.y = FK.base + PI;
    scene.add(d);
    FK.dummies.push(d);
    FK.dBodies.push({ x: d.position.x, z: d.position.z, vx: 0, vz: 0, r: 0.18, h: 0.6 });
  }
  // 골키퍼
  FK.keeper = new Avatar(KEEPER_LOOK, { shadow: false, blob: true });
  scene.add(FK.keeper.root);
  FK.kx = gx - 0.32;
  FK.kz = g.cz;
  FK.kBody = { x: FK.kx, z: FK.kz, vx: 0, vz: 0, r: 0.22, h: 1.25 };
  Object.assign(FK, { on: true, phase: 'aim', hold: 0, charging: false, t: 0, touched: '' });
  FK.prevYaw = cam.yawT;
  cam.yawT = -PI / 2; // 공 뒤에서 골대를 보게
  fkArrow.visible = true;
  $('fkBar').hidden = false;
  setPower(0);
  placeShooter();
  lastMe.x = me.x;
  lastMe.z = me.z;
}
// 나는 공 뒤에서 찰 방향을 본다
function placeShooter() {
  const b = room.ball.pos();
  const a = FK.base + FK.aim;
  Object.assign(me, { x: b.x - Math.sin(a) * 0.6, z: b.z - Math.cos(a) * 0.6, h: a, y: 0, vy: 0 });
  if (fpv.on) fpv.yaw = fpv.yawT = a;
  fkArrow.position.set(b.x, 0, b.z);
  fkArrow.rotation.y = a;
}
function fkShoot() {
  if (!FK.on || FK.phase !== 'aim') return;
  FK.charging = false;
  const p = pingpong(FK.hold / 1.1);
  const curl = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // 세게 찰수록 빠르고 높이 뜬다. 감아 차면 겨냥한 반대쪽(골대 가운데 쪽)으로 휜다
  // 파워 중간쯤(0.5~0.65)이면 벽을 넘겨 크로스바 아래로 떨어진다. 너무 약하면 벽, 너무 세면 크로스바 위
  room.ball.shoot(FK.base + FK.aim, 5 + p * 5, 2 + p * 7, curl ? (FK.aim > 0 ? 1 : -1) * (6 + p * 6) : 0);
  FK.guess = (Math.random() - 0.5) * 0.35; // 골키퍼가 살짝 잘못 읽기도 한다
  thump();
  Object.assign(FK, { phase: 'flying', shotAt: FK.t, touched: '' });
  FK.kBody.hit = false;
  for (const b of FK.dBodies) b.hit = false;
  fkArrow.visible = false;
  setPower(p);
}
function fkResult(kind) {
  if (!FK.on || FK.phase !== 'flying') return;
  FK.phase = 'result';
  FK.endAt = FK.t + (kind === 'goal' ? 2.8 : 2.2);
  $('fkBar').hidden = true; // 결과 쪽지와 겹치지 않게
  if (kind === 'saved') UI.toast('골키퍼가 막았어요', 'K를 누르면 한 번 더 차요.', 2200);
  else if (kind === 'wall') UI.toast('수비벽에 막혔어요', 'K를 누르면 한 번 더 차요.', 2200);
  else if (kind === 'miss') UI.toast('아깝게 빗나갔어요', 'K를 누르면 한 번 더 차요.', 2200);
}
function endFreeKick() {
  if (!FK.on) return;
  for (const d of FK.dummies) scene.remove(d);
  FK.dummies = [];
  FK.dBodies = [];
  if (FK.keeper) {
    FK.keeper.dispose();
    FK.keeper = null;
  }
  FK.on = false;
  FK.phase = '';
  fkArrow.visible = false;
  $('fkBar').hidden = true;
  cam.yawT = FK.prevYaw;
}
function updateFreeKick(dt) {
  if (!FK.on) return;
  FK.t += dt;
  const g = room.pitch;
  const b = room.ball.pos();
  if (FK.phase === 'aim') {
    const r = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    FK.aim = clamp(FK.aim - r * 0.55 * dt, -0.7, 0.7); // 천천히 돌아서 구석을 노리기 쉽게
    placeShooter();
    if (FK.charging) {
      FK.hold += dt;
      setPower(pingpong(FK.hold / 1.1));
    }
    FK.kz = g.cz + Math.sin(FK.t * 1.7) * 0.25; // 골키퍼는 좌우로 살짝 움직이며 기다린다
  } else if (FK.phase === 'flying') {
    // 골키퍼: 공이 골라인에 닿을 곳을 보고 몸을 날린다 (조금 늦게 반응, 빠르기에 한계)
    if (FK.t - FK.shotAt > 0.25 && b.vx > 0.3) {
      const zAt = b.z + b.vz * ((FK.kx - b.x) / b.vx) + (FK.guess || 0);
      FK.kz += clamp(clamp(zAt, g.cz - 0.7, g.cz + 0.7) - FK.kz, -1.2 * dt, 1.2 * dt);
    }
    if (!FK.touched && FK.kBody.hit) Object.assign(FK, { touched: 'keeper', touchAt: FK.t });
    if (!FK.touched && FK.dBodies.some((x) => x.hit)) Object.assign(FK, { touched: 'wall', touchAt: FK.t });
    const sp = Math.hypot(b.vx, b.vz);
    if ((FK.touched && FK.t - FK.touchAt > 1.0) || (sp < 0.25 && b.y < 0.13) || FK.t - FK.shotAt > 4) fkResult(FK.touched === 'keeper' ? 'saved' : FK.touched === 'wall' ? 'wall' : 'miss');
  } else if (FK.phase === 'result' && FK.t > FK.endAt) {
    endFreeKick();
    return;
  }
  const kvz = dt > 0 ? (FK.kz - FK.kBody.z) / dt : 0;
  Object.assign(FK.kBody, { x: FK.kx, z: FK.kz, vx: 0, vz: kvz });
  FK.keeper.root.position.set(FK.kx, 0, FK.kz);
  FK.keeper.root.rotation.y = -PI / 2; // 경기장 쪽을 본다
  FK.keeper.update(dt, { t, moving: Math.abs(kvz) > 0.3 ? 1 : 0, air: false, st: 0, seat: null, act: '', dn: 0, emote: '', emoteT: 9, hitT: 9 });
}
function projectToScreen(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: VB.x + (_v.x * 0.5 + 0.5) * VB.w, y: VB.y + (-_v.y * 0.5 + 0.5) * VB.h };
}

// ---------- 에이전트 ----------
const agents = new Map();
function lookFor(id) {
  const R = rng(hashStr(id) || 7);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const l = {};
  for (const [k, part] of Object.entries(LOOK_PARTS)) l[k] = pick(Object.keys(part.options));
  l.skin = pick(SKINS)[1];
  l.hairColor = pick(HAIR_COLORS)[1];
  l.cloth = pick(PALETTE)[1];
  l.accent = pick(PALETTE)[1];
  if (R() < 0.55 || l.hat === 'crown') l.hat = 'none'; // 왕관은 나만
  if (R() < 0.65) l.glasses = 'none';
  if (R() < 0.7) l.neck = 'none';
  if (l.hair === 'none' && R() < 0.7) l.hair = 'short';
  return normalizeLook(l);
}
function makeAgent(d) {
  const av = new Avatar(lookFor(d.id), { shadow: false, blob: true }); // 캐릭터는 동그란 그림자 (렉 방지)
  scene.add(av.root);
  const type = ['claude', 'codex', 'gemini'].includes(d.type) ? d.type : 'agent';
  const a = {
    id: d.id,
    data: d,
    av,
    lbl: makeLabel(`t-${type}`),
    x: DOOR.x,
    z: DOOR.z,
    h: -PI / 2,
    st: 0,
    seat: null,
    act: '',
    moving: 0,
    path: [],
    then: null,
    destH: null,
    mode: 'idle',
    role: 'none',
    emote: '',
    emoteT: 9,
    hitT: 9,
    tries: 0,
  };
  agents.set(d.id, a);
  return a;
}
function removeAgent(a) {
  releaseAll(a.id);
  clearTimeout(a.timer);
  a.av.dispose();
  a.lbl.el.remove();
  agents.delete(a.id);
}
function standUp(a) {
  if (!a.st) return;
  const s = a.seat;
  const d = s.kind === 'chair' ? -0.62 : s.kind === 'bean' ? 0.85 : 0.62;
  a.x = s.x + Math.sin(s.h) * d;
  a.z = s.z + Math.cos(s.h) * d;
  a.st = 0;
  a.seat = null;
}
function sitOn(a, seat) {
  a.st = seat.kind === 'bean' ? 2 : 1;
  a.seat = seat;
  a.x = seat.x;
  a.z = seat.z;
  a.h = seat.h;
  a.path = [];
  a.mode = 'idle';
}
function approach(seat) {
  if (seat.kind === 'chair') return { x: seat.x, z: seat.z, h: seat.h };
  const d = seat.kind === 'bean' ? 0.85 : 0.62;
  return { x: seat.x + Math.sin(seat.h) * d, z: seat.z + Math.cos(seat.h) * d, h: seat.h + PI };
}
function goTo(a, t, then) {
  standUp(a);
  const path = grid.find(a.x, a.z, t.x, t.z) || [];
  path.push({ x: t.x, z: t.z });
  a.path = path;
  a.then = then || null;
  a.destH = t.h ?? null;
  a.mode = 'walk';
}
function stepWalk(a, dt) {
  let budget = (a.role === 'report' && rankOfAgent(a.data) >= 2 ? 3.9 : 2.3) * dt; // 대리부터 뛰어와서 보고
  while (budget > 0 && a.path.length) {
    const wp = a.path[0];
    const dx = wp.x - a.x;
    const dz = wp.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      a.path.shift();
      continue;
    }
    a.h = angleDamp(a.h, Math.atan2(dx, dz), 12, dt);
    if (d <= budget) {
      a.x = wp.x;
      a.z = wp.z;
      a.path.shift();
      budget -= d;
    } else {
      a.x += (dx / d) * budget;
      a.z += (dz / d) * budget;
      budget = 0;
    }
  }
  if (!a.path.length) {
    a.mode = 'idle';
    if (a.destH != null) a.h = a.destH;
    const f = a.then;
    a.then = null;
    f?.();
  }
}
function toDesk(a, instant) {
  let k;
  if (rankOfAgent(a.data) === 5 && NEAR_BOSS.length) {
    // 오른팔: 내 자리에서 가장 가까운 책상을 먼저 차지한다 (다른 직원이 앉아 있으면 다른 자리로 보낸다)
    const best = NEAR_BOSS[0];
    const who = used.get(best);
    const other = who && who !== a.id && who !== 'me' ? agents.get(who) : null;
    if (other && rankOfAgent(other.data) < 5) {
      used.delete(best);
      other.role = 'none';
      setTimeout(() => agents.has(other.id) && isBusy(other.data.state) && toDesk(other, false), 0);
    }
    k = claim(NEAR_BOSS, a.id, 0);
  } else k = claim(WORK_KEYS, a.id, hashStr(a.id) % WORK_KEYS.length);
  a.role = 'work';
  if (!k) {
    const t = { x: W / 2 + 1.4 + (hashStr(a.id) % 5) * 0.45, z: 2.2, h: PI };
    if (instant) Object.assign(a, { x: t.x, z: t.z, h: t.h });
    else goTo(a, t);
    return;
  }
  const seat = seatById.get(k);
  if (instant) return sitOn(a, seat);
  goTo(a, approach(seat), () => sitOn(a, seat));
}
// 골라서 퇴근시킨 에이전트: 지금 쉬는 동안만 집에 간다 (새 일을 받으면 다시 출근)
const homeNow = {}; // 서버에 저장되기 전에도 바로 반영되게
const wentHome = (d) => !isBusy(d.state) && [settings.sentHome?.[d.id], homeNow[d.id]].includes(d.stateStartedAt || 0);
function sendHome(a, quiet) {
  const since = a.data.stateStartedAt || 0;
  homeNow[a.id] = since;
  api('/api/send-home', { id: a.id, since });
  leave(a);
  if (!quiet) UI.toast(nameOf(a.data), '오늘은 퇴근했어요. 새 일을 받으면 다시 출근해요.', 2400);
}
function toLounge(a, instant) {
  if (settings.hideResting || wentHome(a.data)) return leave(a, instant);
  const k = claim(LOUNGE_KEYS, a.id, hashStr(a.id) % LOUNGE_KEYS.length);
  if (!k) return leave(a, instant);
  a.role = 'rest';
  const spot = LOUNGE.find((s) => s.key === k);
  if (spot.seat) {
    const seat = seatById.get(spot.seat);
    if (instant) return sitOn(a, seat);
    return goTo(a, approach(seat), () => sitOn(a, seat));
  }
  if (instant) {
    standUp(a);
    Object.assign(a, { x: spot.x, z: spot.z, h: spot.h });
    return;
  }
  goTo(a, spot);
}
function leave(a, instant) {
  releaseAll(a.id);
  a.role = 'leave';
  if (instant) return removeAgent(a);
  goTo(a, DOOR, () => removeAgent(a));
}

// 보고: 내가 어디 있든 내 옆 빈자리를 찾아 걸어온다
function reportSpot(a) {
  const taken = [...agents.values()].filter((o) => o !== a && o.role === 'report' && o.spot).map((o) => o.spot);
  for (const rad of [0.95, 1.35, 1.8]) {
    for (let k = 0; k < 12; k++) {
      const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (PI / 6);
      const ang = me.h + off;
      const x = me.x + Math.sin(ang) * rad;
      const z = me.z + Math.cos(ang) * rad;
      if (x < 0.4 || z < 0.4 || x > W - 0.4 || z > D - 0.4) continue;
      if (!grid.free(grid.idx(x, z))) continue;
      if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < 0.6)) continue;
      return { x, z };
    }
  }
  return { x: clamp(me.x + 1, 0.5, W - 0.5), z: clamp(me.z, 0.5, D - 0.5) };
}
// 미리보기(보고함 한 줄, 말풍선, 카드)용: 마크다운 기호를 빼고 글만
const clean = (s) =>
  String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|?\s*:?-{3,}[-|:\s]*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|~~|[*`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
// 보고 자세히: 에이전트 답변을 마크다운 서식으로 보여 준다.
// 먼저 모든 글을 이스케이프하고, 정해 둔 서식(굵게, 기울임, 코드, 목록, 표, 제목, 인용, 링크)만 태그로 바꾼다.
function mdInline(t) {
  const codes = [];
  let h = esc(String(t).replace(/\u0000/g, '')).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  h = h
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return h.replace(/\u0000(\d+)\u0000/g, (_, k) => `<code>${codes[k]}</code>`);
}
const MD_LIST = /^\s*([-*+]|\d+[.)])\s+/;
function md(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (isRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => mdInline(c.trim()));
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const hd = l.match(/^\s*#{1,6}\s+(.*)$/);
    if (hd) {
      out.push(`<p class="mdh">${mdInline(hd[1])}</p>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${buf.map(mdInline).join('<br>')}</blockquote>`);
      continue;
    }
    if (MD_LIST.test(l)) {
      const ordered = /^\s*\d+[.)]\s+/.test(l);
      const items = [];
      // 번호 목록과 점 목록이 바뀌면 다른 목록으로 끊는다
      while (i < lines.length && MD_LIST.test(lines[i]) && /^\s*\d+[.)]\s+/.test(lines[i]) === ordered) {
        items.push(lines[i++].replace(MD_LIST, ''));
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !MD_LIST.test(lines[i])) items[items.length - 1] += ' ' + lines[i++].trim();
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${mdInline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>|-{3,}\s*$)/.test(lines[i]) && !MD_LIST.test(lines[i]) && !isRow(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]); // 어떤 블록에도 안 맞는 줄은 그냥 글로
    out.push(`<p>${buf.map(mdInline).join('<br>')}</p>`);
  }
  return out.join('');
}
function reportLine(r) {
  const msg = clean(r.message);
  const head = r.kind === 'interrupted' ? '중단됐어요. ' : '다 했어요! ';
  return head + (msg.length > 90 ? msg.slice(0, 90) + '…' : msg || '확인해 주세요.');
}
function walkToMe(a) {
  a.spot = reportSpot(a);
  goTo(a, a.spot, () => {
    if (Math.hypot(me.x - a.x, me.z - a.z) > 2.1 && a.tries++ < 5) return walkToMe(a); // 그사이 내가 움직였다
    deliver(a);
  });
}
function deliver(a) {
  const r = a.report;
  a.h = toward(a.x, a.z, me.x, me.z);
  a.emote = rankOfAgent(a.data) >= 4 ? 'salute' : 'wave'; // 부장부터 경례
  if (a.emote === 'salute') popEmoji(a.lbl, '🫡', 1);
  a.emoteT = 0;
  showBubble(a.lbl, reportLine(r), 'report', 9000);
  chime();
  fx.burst(a.x, 1.5, a.z, 36);
  me.emote = 'heart';
  me.emoteT = 0;
  popEmoji(me.lbl, '💗', 3);
  a.timer = setTimeout(() => {
    a.spot = null;
    if (!agents.has(a.id)) return;
    if (isBusy(a.data.state)) toDesk(a);
    else toLounge(a);
  }, 9000);
}
function startReport(a, r) {
  clearTimeout(a.timer);
  releaseAll(a.id);
  a.role = 'report';
  a.report = r;
  a.tries = 0;
  // 말풍선과 보고함 줄이 알려 주니, 보고함을 접어 둔 큰 창에서만 알림 쪽지를 띄운다 (같은 보고가 여러 군데 겹치지 않게)
  if (!MINI && inboxShut()) UI.toast(nickOf(r.agentId) || r.name, r.kind === 'interrupted' ? '중단됐어요. 보고하러 가는 중이에요' : '보고하러 가는 중이에요', 2600);
  walkToMe(a);
}

// ---------- 상태 글 ----------
const TOOL_KO = {
  Bash: '터미널 쓰는 중', Edit: '코드 고치는 중', MultiEdit: '코드 고치는 중', Write: '파일 쓰는 중', Read: '파일 읽는 중',
  Grep: '코드 찾는 중', Glob: '파일 찾는 중', WebSearch: '웹 검색 중', WebFetch: '웹 읽는 중', Agent: '도우미 부르는 중',
  Task: '도우미 부르는 중', TodoWrite: '할 일 정리 중', NotebookEdit: '노트북 고치는 중', Skill: '스킬 쓰는 중',
  apply_patch: '코드 고치는 중', shell: '터미널 쓰는 중', exec_command: '터미널 쓰는 중',
};
function statusText(d, role) {
  if (role === 'report') return '보고하러 가는 중';
  if (role === 'leave') return '퇴근하는 중';
  switch (d.state) {
    case 'working':
      return d.tool ? TOOL_KO[d.tool] || `${d.tool} 쓰는 중` : '생각하는 중';
    case 'monitoring':
      return '지켜보는 중';
    case 'waiting':
      return '답을 기다려요';
    case 'blocked':
      return '허락이 필요해요';
    case 'done':
      return d.interrupted ? '중단됐어요' : '쉬는 중';
    case 'idle':
      return '쉬는 중';
    default:
      return '';
  }
}
// 상태 글 앞에 붙는 아이콘 (index.html의 선 아이콘)
function statusIco(d, role) {
  if (role === 'report') return 'report';
  if (role === 'leave') return 'home';
  if (d.state === 'working') return d.tool ? 'work' : 'think';
  if (d.state === 'monitoring') return 'eye';
  if (ATTN.has(d.state)) return 'attn';
  return d.state === 'done' && d.interrupted ? 'pause' : 'rest';
}
// 이름표의 상태: 일하는 중(work), 나를 기다림(attn), 보고하러 옴(report), 쉼(rest), 중단(stop), 퇴근(leave)
const labelState = (a) =>
  a.role === 'report' ? 'report' : a.role === 'leave' ? 'leave' : ATTN.has(a.data.state) ? 'attn' : ACTIVE.has(a.data.state) ? 'work' : a.data.interrupted ? 'stop' : 'rest';
// 이름표를 잠깐 반짝인다 (상태 묶음에서 골랐을 때, 허락 요청이 왔을 때)
function pingLabel(a) {
  const el = a.lbl.el;
  el.classList.remove('ping');
  void el.offsetWidth;
  el.classList.add('ping');
}
const short = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const typeLabel = (t) => ({ claude: 'Claude', codex: 'Codex', gemini: 'Gemini' })[t] || t || '에이전트';
function ago(at) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ---------- 동기화 ----------
let synced = false;
const performed = new Set();
let lastState = { agents: [], reports: [], ok: false, unread: 0, sources: {} };

function applySettings(s) {
  if (!s) return;
  if (s.map && s.map !== MAP_ID) {
    // 맵이 바뀌면 새로 그린다 (설정 팝업을 보는 중이면 닫을 때)
    if (!setupOpen) return location.reload();
    reloadAfterSetup = true;
  }
  const name = s.bossName || '나';
  if (me.lbl.nm.textContent !== name && Date.now() - nameTouched > 3000) me.lbl.nm.textContent = name;
  if (typeof s.sound === 'boolean' && s.sound !== soundOn && Date.now() - soundTouched > 3000) setSound(s.sound, false);
  if (typeof s.hideResting === 'boolean' && s.hideResting !== settings.hideResting && Date.now() - hideTouched > 3000) setHide(s.hideResting, false);
  if (typeof s.pinPopover === 'boolean' && s.pinPopover !== pinned && Date.now() - pinTouched > 3000) setPin(s.pinPopover, false);
  if (MINI && typeof s.miniInbox === 'boolean' && s.miniInbox !== miniInboxOpen && Date.now() - miniInboxTouched > 3000) setMiniInbox(s.miniInbox, false);
  if (Date.now() - tagTouched > 3000) setTagDetail(!!s.tagDetail, false); // 이름표에 직급과 하는 일을 늘 보이기
  showNews(!!s.news && !setupOpen);
  Object.assign(settings, s);
}

function sync(st) {
  lastState = st;
  applySettings(st.settings);
  showRadio(st.radio);
  showYT(st.youtube);
  showUpd(st.update);
  const first = !synced;
  const now = Date.now();
  // 이번에 새로 들어온 보고 (이 에이전트는 숨김 설정이어도 걸어와서 보고한다)
  const fresh = (st.reports || []).filter((r) => !performed.has(r.id));
  const reporting = new Set(first ? [] : fresh.filter((r) => !r.read && r.kind !== 'attention').map((r) => r.agentId));
  const seen = new Set();
  for (const d of st.agents || []) {
    const busy = isBusy(d.state);
    if (!agents.has(d.id)) {
      if (!busy && now - (d.updatedAt || 0) > RECENT_MS) continue;
      if (!busy && (settings.hideResting || wentHome(d)) && !reporting.has(d.id)) continue;
    }
    seen.add(d.id);
    const a = agents.get(d.id) || makeAgent(d);
    a.data = d;
  }
  for (const a of [...agents.values()]) if (!seen.has(a.id) && a.role !== 'leave' && a.role !== 'report') leave(a, first);

  for (const r of fresh) {
    performed.add(r.id);
    if (first || r.read) continue;
    if (r.kind === 'attention') {
      if (!MINI && inboxShut()) UI.toast(nickOf(r.agentId) || r.name, '허락이 필요해요. 자리에서 손을 들고 있어요.', 3500);
      const w = agents.get(r.agentId);
      if (w) pingLabel(w);
      chime(true);
      continue;
    }
    const a = agents.get(r.agentId);
    if (a && a.role !== 'leave') startReport(a, r);
  }

  for (const a of agents.values()) {
    if (a.role === 'report' || a.role === 'leave') continue;
    const busy = isBusy(a.data.state);
    if (busy && a.role !== 'work') toDesk(a, first);
    else if (!busy && (a.role !== 'rest' || settings.hideResting || wentHome(a.data))) toLounge(a, first);
  }
  synced = true;
  renderHud(st);
  renderInbox();
  updateRankTags();
  checkPromos(st, first);
  renderStaff();
  renderRest();
  drawStatus(st);
}

async function refresh() {
  try {
    const st = await api('/api/state');
    if (!st || !Array.isArray(st.agents)) return;
    if (!st.at) return; // 서버가 아직 한 번도 못 읽었다
    sync(st);
  } catch {
    $('conn').querySelector('.ct').textContent = '작업실 서버와 연결이 끊겼어요';
    $('conn').classList.add('off');
  }
}

// ---------- HUD ----------
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
function renderHud(st) {
  const ags = st.agents || [];
  const work = ags.filter((d) => ACTIVE.has(d.state)).length;
  const attn = ags.filter((d) => ATTN.has(d.state)).length;
  const done = (st.reports || []).filter((r) => r.kind !== 'attention' && r.at >= startOfToday()).length;
  for (const [id, n] of [['cAttn', attn], ['cWork', work], ['cDone', done]]) {
    $(id).querySelector('b').textContent = n;
    $(id).classList.toggle('zero', !n);
  }
  // 작은 창: 장면 아래 한 줄 요약
  if (MINI) {
    const rest = restingNow().filter((d) => !wentHome(d) && !settings.hideResting).length;
    const sum = `${work}|${done}|${rest}`;
    if (sum !== miniSumSig) {
      miniSumSig = sum;
      $('miniSum').innerHTML = `<span>일하는 중 <b>${work}</b></span><span>오늘 끝남 <b>${done}</b></span><span>쉬는 중 <b>${rest}</b></span>`;
    }
  }
  // 연동: 평소에는 아이콘만, 볼 수 있는 앱이 없을 때만 글자로 알린다
  const conn = $('conn');
  const src = st.sources || {};
  const names = [src.orca && 'Orca', src.claude && 'Claude', src.codex && 'Codex'].filter(Boolean);
  conn.querySelector('.ct').textContent = names.length ? '' : '볼 수 있는 앱이 없어요';
  conn.title = `${names.length ? `보는 중: ${names.join(', ')}` : '볼 수 있는 앱이 없어요'}${st.error ? `\nOrca: ${st.error}` : ''}\n누르면 연동 설정이 열려요`;
  conn.classList.toggle('off', !names.length);
  const u = st.unread || 0;
  $('unreadCnt').textContent = u || '';
  $('unreadCnt2').textContent = u || '';
  if (MINI) autoMiniInbox(st, u);
  unreadSeen = u;
  document.title = u ? `(${u}) 에이전트 작업실` : '에이전트 작업실';
}
let miniSumSig = '';
// 작은 창: 열어 볼 보고가 있으면 보고함을 펼쳐서 띄우고, 새 보고가 오면 펼친다.
// 확인할 보고가 하나도 안 남으면 접어서 방을 크게 보여 준다
let miniPending = -1;
function autoMiniInbox(st, u) {
  const reports = st.reports || [];
  const byId = agentsById();
  const pending = reports.filter((r) => !r.seen).length;
  if (miniPending < 0) {
    const want = u > 0 || reports.some((r) => !r.seen && waitingNow(r, byId));
    if (want !== miniInboxOpen) setMiniInbox(want, true);
  } else if (u > unreadSeen && !miniInboxOpen) setMiniInbox(true, true);
  else if (!pending && miniPending > 0 && miniInboxOpen) setMiniInbox(false, true);
  miniPending = pending;
}

// 위쪽 상태 묶음을 누르면: 그 에이전트로 카메라를 잠깐 옮기고 이름표를 반짝인다 (누를 때마다 다음 에이전트)
let focusNo = 0;
function focusNext(states, none) {
  const list = [...agents.values()].filter((a) => states.has(a.data.state) && a.role !== 'leave');
  if (!list.length) {
    UI.toast(none, '', 1800);
    return null;
  }
  const a = list[focusNo++ % list.length];
  cam.focus = { id: a.id, t: 3.2 };
  pingLabel(a);
  return a;
}
// 보고함을 열고 그 구역으로 내려간다 ('attn': 나를 기다려요, 'new': 새 보고)
function showReports(sec) {
  setInbox(true);
  if (inboxView !== 'reports') setInboxView('reports');
  const li = $('inboxList').querySelector(`.sec[data-sec="${sec}"]`);
  $('inboxList').scrollTop = li ? Math.max(0, li.offsetTop - $('inboxList').offsetTop) : 0;
}
$('cAttn').onclick = () => {
  if (focusNext(ATTN, '지금 나를 기다리는 에이전트가 없어요')) showReports('attn');
};
$('cWork').onclick = () => focusNext(ACTIVE, '지금 일하는 에이전트가 없어요');
$('cDone').onclick = () => showReports('new');

// 보고함은 구역으로 나눈다: 나를 기다려요(허락이나 답을 기다리는 에이전트) → 새 보고 → 확인한 보고(맨 아래 한 줄로 접혀 있다)
let inboxView = 'reports'; // 'reports' 보고함 | 'seen' 확인한 보고 | 'staff' 직원 명부
let inboxSig = '';
const agentsById = () => new Map((lastState.agents || []).map((d) => [d.id, d]));
// 아직 답을 기다리는 허락 요청인지 (에이전트가 이미 다시 일하면 지난 요청이다)
const waitingNow = (r, byId) => r.kind === 'attention' && ATTN.has(byId.get(r.agentId)?.state);
// 캐릭터 얼굴 동그라미: 방 안의 그 캐릭터와 같은 모습 (작업실에 없는 에이전트도 같은 얼굴이 나온다)
const lookOf = (id) => agents.get(id)?.av.look || lookFor(String(id));
function faceStyle(look) {
  const u = faceURL(look);
  return `--c:${esc(look.cloth)}${u ? `;background-image:url(${u})` : ''}`;
}
const faceHtml = (id, cls, badge = '') => `<span class="${cls} face" style="${faceStyle(lookOf(id))}">${badge}</span>`;
function setFace(el, look) {
  el.classList.add('face');
  el.setAttribute('style', faceStyle(look));
}
// 접힌 보고함 줄에 보여 줄 한 줄: 나를 기다리는 보고, 없으면 안 열어 본 보고, 그것도 없으면 가장 최근 보고
function renderPeek() {
  const all = lastState.reports || [];
  const byId = agentsById();
  const w = all.find((x) => !x.seen && waitingNow(x, byId));
  const r = w || all.find((x) => !x.read && !x.seen) || all.find((x) => !x.seen);
  const t = r
    ? `${kindIco(w ? 'attention' : r.kind === 'attention' ? 'interrupted' : r.kind)}${esc(nickOf(r.agentId) || r.name)} · ${w ? '허락을 기다려요' : ago(r.at)}`
    : all.length
      ? '새 보고가 없어요'
      : '아직 받은 보고가 없어요';
  if (peekSig !== t) {
    peekSig = t;
    $('inboxPeek').innerHTML = t;
  }
}
let peekSig = '';
// 보고 한 줄. wait: 지금 나를 기다리는 보고면 줄 안에 '앱에서 답하기' 버튼을 넣는다
function inboxRow(r, wait) {
  const nick = nickOf(r.agentId);
  const where = [nick ? r.name : '', r.app, r.repo].filter(Boolean).join(' · '); // 이름을 붙였으면 작업 이름은 아래 줄로
  const k = wait ? 'attention' : r.kind === 'attention' ? 'interrupted' : kc(r.kind);
  const chip = wait || k === 'done' ? '' : r.kind === 'attention' ? '지난 요청' : KIND_KO[k];
  const text = r.kind === 'attention' ? clean(r.message) || '허락이나 답을 기다려요' : clean(r.message) || (r.kind === 'interrupted' ? '중간에 멈췄어요' : '남긴 답이 없어요');
  const acts = wait
    ? `<div class="iacts">${
        r.app && !r.demo ? `<button type="button" class="igo" data-act="app" title="${esc(r.app)}${r.canSession ? '의 그 대화를' : '을(를)'} 열어요">${esc(r.app)}에서 답하기${ico('out')}</button>` : ''
      }<button type="button" class="igh" data-act="open">대화 보기</button></div>`
    : '';
  const side = r.seen
    ? `<button type="button" class="iact" data-act="unsee" title="보고함으로 되돌려요" aria-label="보고함으로 되돌리기">${ico('undo')}</button>`
    : wait
      ? ''
      : `<button type="button" class="iact" data-act="seen" title="확인한 보고로 보내요" aria-label="확인">${ico('check')}</button>`;
  return `<li class="k-${k}${wait ? ' wait' : ''}${r.read ? '' : ' unread'}${r.id === openReportId ? ' on' : ''}" data-id="${esc(r.id)}">${faceHtml(r.agentId, 'iav', kindIco(k))}<div class="itx"><div class="itop"><b>${esc(nick || r.name)}</b><time>${esc(ago(r.at))}</time></div><small>${
    chip ? `<em class="kchip k-${k}">${chip}</em>` : ''
  }${esc(where)}</small><p>${esc(text)}</p>${acts}</div>${side}</li>`;
}
function renderInbox() {
  if (MINI) renderPeek();
  if (inboxView === 'staff') return;
  const all = lastState.reports || [];
  const byId = agentsById();
  const open = all.filter((r) => !r.seen);
  const wait = open.filter((r) => waitingNow(r, byId));
  const fresh = open.filter((r) => !waitingNow(r, byId));
  const seen = all.filter((r) => r.seen);
  const list = inboxView === 'seen' ? seen : open;
  const sig = JSON.stringify([inboxView, openReportId, list.map((r) => [r.id, r.read, nickOf(r.agentId), waitingNow(r, byId)]), seen.length, Math.floor(Date.now() / 60000)]);
  if (sig === inboxSig) return;
  inboxSig = sig;
  $('readAll').hidden = inboxView !== 'reports' || !fresh.length;
  let html = '';
  if (inboxView === 'seen') html = seen.length ? seen.map((r) => inboxRow(r, false)).join('') : '<li class="empty">확인한 보고가 여기 모여요.</li>';
  else {
    if (wait.length) html += `<li class="sec a" data-sec="attn">나를 기다려요 <b>${wait.length}</b></li>${wait.map((r) => inboxRow(r, true)).join('')}`;
    if (fresh.length) html += `<li class="sec" data-sec="new">새 보고 <b>${fresh.length}</b></li>${fresh.map((r) => inboxRow(r, false)).join('')}`;
    if (!open.length)
      html += `<li class="empty">${
        all.length ? '모두 확인했어요.' : '에이전트가 일을 끝낼 때마다<br>여기에 보고가 쌓여요.<br><button type="button" class="btn ghost sm" data-demo>연습 보고 받아 보기</button>'
      }</li>`;
    if (seen.length) html += `<li class="more"><button type="button" data-view="seen">확인한 보고 ${seen.length}개 보기</button></li>`;
  }
  $('inboxList').innerHTML = html;
}

let statusSig = '';
function drawStatus(st) {
  const ags = st.agents || [];
  const info = {
    work: ags.filter((d) => ACTIVE.has(d.state)).map((d) => ({ name: nameOf(d), sub: [d.app, statusText(d)].filter(Boolean).join(' · ') })),
    attn: ags.filter((d) => ATTN.has(d.state)).map((d) => ({ name: nameOf(d), sub: d.state === 'blocked' ? '허락이 필요해요' : '답을 기다려요' })),
    done: (st.reports || [])
      .filter((r) => r.kind !== 'attention' && r.at >= startOfToday())
      .map((r) => ({ name: nickOf(r.agentId) || r.name, sub: [fmtTime(r.at), r.app, r.repo].filter(Boolean).join(' · ') })),
  };
  const sig = JSON.stringify(info) + fmtTime(Date.now());
  if (sig === statusSig) return;
  statusSig = sig;
  const c = statusTex.userData.canvas;
  const g = statusTex.userData.ctx;
  const w = c.width;
  const fit = (text, maxW) => {
    let s = String(text);
    if (g.measureText(s).width <= maxW) return s;
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  };
  g.fillStyle = '#FBFBF8';
  g.fillRect(0, 0, w, c.height);
  g.textAlign = 'left';
  g.fillStyle = '#22594A';
  g.font = `68px ${FONT_HAND}`;
  g.fillText('오늘의 작업 현황', 56, 104);
  g.textAlign = 'right';
  g.fillStyle = '#8A8F96';
  g.font = `32px ${FONT_HAND}`;
  g.fillText(`${fmtTime(Date.now())} 기준`, w - 56, 100);
  [
    ['일하는 중', info.work, '#3D6FD8'],
    ['나를 기다려요', info.attn, '#E5484D'],
    ['오늘 끝남', info.done, '#2E8B57'],
  ].forEach(([title, list, color], i) => {
    const x = 56 + i * 400;
    g.textAlign = 'left';
    g.fillStyle = color;
    g.fillRect(x, 136, 360, 7);
    g.fillStyle = '#2A2F2E';
    g.font = `44px ${FONT_HAND}`;
    g.fillText(`${title} ${list.length}`, x, 200);
    list.slice(0, 7).forEach((item, k) => {
      g.fillStyle = '#333';
      g.font = `34px ${FONT_HAND}`;
      g.fillText(fit(item.name, 360), x, 262 + k * 72);
      g.fillStyle = '#8A8F96';
      g.font = `22px ${FONT_BODY}`;
      g.fillText(fit(item.sub, 360), x, 290 + k * 72);
    });
    g.font = `30px ${FONT_HAND}`;
    g.fillStyle = '#9AA0A6';
    if (list.length > 7) g.fillText(`외 ${list.length - 7}개`, x, 262 + 7 * 72);
    if (!list.length) g.fillText('없음', x, 262);
  });
  statusTex.needsUpdate = true;
}

// ---------- 대화 보기: 보고함이나 캐릭터를 누르면 그 에이전트와 나눈 대화를 채팅처럼 보여 준다 ----------
// 먼저 아는 것(마지막으로 시킨 일과 답)으로 그리고, 이 Mac의 세션 기록에서 최근 대화를 읽어 오면 바꿔 그린다.
let openReportId = null;
let cvAgentId = null;
let cvSeq = 0;
let cvNavIds = [];
let cvReply = '';
const KIND_KO = { done: '완료', attention: '허락 필요', interrupted: '중단됨' };
const KINDS = new Set(['done', 'attention', 'interrupted', 'working', 'rest', 'boss']);
const kc = (k) => (KINDS.has(k) ? k : 'done');
const plainStatus = (d, role) => statusText(d, role);
function when(at) {
  if (!at) return '';
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString('ko-KR', today ? { hour: 'numeric', minute: '2-digit' } : { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function convoKind(r, d) {
  if (r) return kc(r.kind);
  if (d.state === 'blocked' || d.state === 'waiting') return 'attention';
  if (ACTIVE.has(d.state)) return 'working';
  return d.interrupted ? 'interrupted' : 'done';
}
function openReport(r, skip) {
  openConvo({ r, skip });
}
// 캐릭터에서 열면: 일하는 중이 아니고 그 에이전트의 보고가 있으면 보고로, 아니면 지금 상태로
function openAgentConvo(a) {
  const r = (lastState.reports || []).filter((x) => x.agentId === a.id).sort((x, y) => y.at - x.at)[0];
  openConvo(r && !ACTIVE.has(a.data.state) ? { r } : { a });
}
function openConvo({ r = null, a = null, skip = null }) {
  const d = r ? agents.get(r.agentId)?.data || null : a.data;
  const src = r || d;
  const agentId = r ? r.agentId : a.id;
  const kind = convoKind(r, d);
  const app = src.app || typeLabel(src.type);
  openReportId = r ? r.id : null;
  cvAgentId = agentId;
  const seq = ++cvSeq;
  // 머리: 캐릭터 색 동그라미와 상태 표시, 이름, 상태 · 앱 · 저장소 · 시각
  setFace($('cvAv'), lookOf(agentId));
  $('cvAv').innerHTML = `<span class="cvk k-${kind}">${kind === 'working' ? ico('work') : kindIco(kind)}</span>`;
  const name = nickOf(agentId) || src.name;
  $('cvName').textContent = name;
  const at = r ? r.at : d.updatedAt || Date.now();
  const where = [app, r ? r.repo : d.worktree?.repo, r ? r.branch : d.worktree?.branch].filter(Boolean).join(' · ');
  $('cvMeta').innerHTML = `<em class="kchip k-${kind}">${esc(kind === 'working' ? plainStatus(d) : KIND_KO[kind])}</em>${esc(where)}<span title="${esc(new Date(at).toLocaleString('ko-KR'))}"> · ${ago(at)}</span>`;
  // 보고함에서 열면 이전/다음 보고로 넘길 수 있다 (←, →)
  cvNavIds = r ? [...$('inboxList').querySelectorAll('li[data-id]')].map((li) => li.dataset.id).filter((id) => id !== skip) : [];
  const pos = cvNavIds.indexOf(openReportId);
  $('cvNav').hidden = pos < 0 || cvNavIds.length < 2;
  $('cvPos').textContent = `${pos + 1} / ${cvNavIds.length}`;
  $('cvPrev').disabled = pos <= 0;
  $('cvNext').disabled = pos < 0 || pos >= cvNavIds.length - 1;
  // 아래 버튼: 허락이 필요하면 '앱에서 답하기'가 주 버튼
  $('rFolder').hidden = !(r ? r.path : d.worktree?.path);
  $('rOrca').hidden = !src.app || !!src.demo;
  $('rOrca').textContent = kind === 'attention' ? `${app}에서 답하기` : src.canSession ? '세션 열기' : `${app} 열기`;
  $('rOrca').classList.toggle('ghost', kind !== 'attention');
  $('rSeen').hidden = !r || !!r.seen;
  $('rSeen').classList.toggle('ghost', kind === 'attention');
  const ctx = { kind, app, agentId, r, d, name };
  drawConvo([{ prompt: src.prompt || '', reply: kind === 'working' ? '' : src.message || '', at: 0, end: at, tools: 0, interrupted: kind === 'interrupted' }], false, { ...ctx, partial: true });
  $('report').hidden = false;
  UI.openLayer('report', closeReport);
  if (!src.demo)
    api('/api/conversation', { id: agentId })
      .then((res) => {
        if (seq === cvSeq && !$('report').hidden && res?.ok && res.turns?.length) drawConvo(res.turns, res.more, ctx);
      })
      .catch(() => {});
  if (r && !r.read) {
    r.read = true;
    api('/api/read', { id: r.id }).then(refresh);
  }
  inboxSig = '';
  renderInbox();
}
function drawConvo(turns, more, ctx) {
  const face = faceStyle(lookOf(ctx.agentId));
  const out = [];
  if (more) out.push(`<p class="cvmore">더 이전 대화는 ${esc(ctx.app)}에서 볼 수 있어요</p>`);
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    out.push(`<div class="turn${last ? ' last' : ''}">`);
    t = { ...t, prompt: String(t.prompt || ''), reply: String(t.reply || '') };
    if (t.prompt) {
      const long = t.prompt.length > 500;
      out.push(`<div class="msg me"><div class="cbub${long ? ' long' : ''}">${esc(t.prompt)}</div>${long ? '<button type="button" class="more">전체 보기</button>' : ''}<small>나${Number(t.at) ? ` · ${when(Number(t.at))}` : ''}</small></div>`);
    }
    let body = '';
    if (t.reply) body = md(t.reply);
    else if (last && ctx.kind === 'working') body = '<p class="none">답을 쓰는 중이에요…</p>';
    else if (!(last && ctx.kind === 'attention')) body = '<p class="none">남긴 답이 없어요</p>';
    if (body) {
      const tools = Math.max(0, Math.floor(Number(t.tools) || 0));
      const meta = [esc(ctx.name), Number(t.end) ? when(Number(t.end)) : '', tools ? `도구 ${tools}번` : '', t.interrupted === true ? '중단됨' : ''].filter(Boolean).join(' · ');
      out.push(`<div class="msg ag"><span class="mav face" style="${face}"></span><div class="mcol"><div class="cbub md">${body}</div><small>${meta}</small></div></div>`);
    }
    out.push('</div>');
  });
  const note = (k, icon, b, sub) => `<div class="cvnote k-${k}">${ico(icon)}<div><b>${b}</b><span>${sub}</span></div></div>`;
  // 허락을 기다리는 질문은 버튼 줄 바로 위에 고정한다 (긴 대화에서도 바로 보이게)
  $('cvWait').hidden = ctx.kind !== 'attention';
  if (ctx.kind === 'attention') $('cvWait').innerHTML = `${ico('attn')}<div><b>${esc(ctx.app)}에서 허락이나 답을 기다리고 있어요</b><span>답해 주면 이어서 일해요.</span></div>`;
  if (ctx.kind === 'working') out.push(note('working', 'work', '지금 일하는 중이에요', esc([plainStatus(ctx.d), ctx.d?.toolHint].filter(Boolean).join(' · '))));
  else if (ctx.kind === 'interrupted') out.push(note('interrupted', 'pause', '중간에 멈췄어요', `${esc(ctx.app)}에서 이어서 시킬 수 있어요.`));
  // Orca가 잘라 준 답을 이 Mac의 기록으로 못 채웠을 때만 알려 준다
  const ml = (ctx.r?.message || '').length;
  if (ctx.partial && ctx.r?.app === 'Orca' && ml >= 190 && ml <= 200) out.push('<p class="cvmore">Orca가 마지막 답의 앞부분만 알려 줘서 여기까지 보여요. 전체는 Orca에서 볼 수 있어요.</p>');
  const body = $('cvBody');
  body.innerHTML = out.join('');
  cvReply = turns[turns.length - 1]?.reply || '';
  $('cvCopy').hidden = !cvReply;
  // 긴 대화도 지금 보고(마지막으로 시킨 일)부터 읽게
  const lt = body.querySelector('.turn.last');
  body.scrollTop = lt && turns.length > 1 ? Math.max(0, lt.offsetTop - 14) : 0;
}
function closeReport() {
  $('report').hidden = true;
  UI.closeLayer('report');
  openReportId = null;
  cvAgentId = null;
  cvSeq++;
  inboxSig = '';
  renderInbox();
}
const currentReport = () => (lastState.reports || []).find((r) => r.id === openReportId);
function cvGo(step) {
  const id = cvNavIds[cvNavIds.indexOf(openReportId) + step];
  const r = id && (lastState.reports || []).find((x) => x.id === id);
  if (r) openReport(r);
}
$('cvPrev').onclick = () => cvGo(-1);
$('cvNext').onclick = () => cvGo(1);
addEventListener('keydown', (e) => {
  if ($('report').hidden || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault();
    cvGo(e.code === 'ArrowLeft' ? -1 : 1);
  }
});
// 긴 질문은 접어 두고 '전체 보기'로 펼친다
$('cvBody').addEventListener('click', (e) => {
  const b = e.target.closest('.more');
  if (!b) return;
  b.textContent = b.previousElementSibling.classList.toggle('long') ? '전체 보기' : '접기';
});
$('rClose').onclick = closeReport;
// 확인: 확인한 보고로 보내고 다음 보고로 넘어간다 (마지막이면 닫는다)
$('rSeen').onclick = () => {
  const id = openReportId;
  if (!id) return closeReport();
  const i = cvNavIds.indexOf(id);
  const nextId = cvNavIds[i + 1] || cvNavIds[i - 1];
  setSeen([id], true);
  const nr = nextId && inboxView !== 'seen' && (lastState.reports || []).find((x) => x.id === nextId && !x.seen);
  if (nr) openReport(nr, id);
  else closeReport();
};
$('rOrca').onclick = () => {
  const app = currentReport()?.app || agents.get(cvAgentId)?.data.app;
  if (app) api('/api/open-app', { app, id: cvAgentId });
};
$('rFolder').onclick = () => {
  const p = currentReport()?.path || agents.get(cvAgentId)?.data.worktree?.path;
  if (p) api('/api/open-folder', { path: p });
};
$('cvCopy').onclick = async () => {
  if (!cvReply) return;
  try {
    await navigator.clipboard.writeText(cvReply);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = cvReply;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  UI.toast('답을 복사했어요', '', 1600);
};
$('inboxList').addEventListener('click', (e) => {
  if (e.target.closest('[data-demo]')) return $('demoBtn').click();
  const view = e.target.closest('button[data-view]');
  if (view) return setInboxView(view.dataset.view);
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'seen' || act === 'unsee') return setSeen([li.dataset.id], act === 'seen');
  const r = (lastState.reports || []).find((x) => x.id === li.dataset.id);
  if (!r) return;
  if (act === 'app') {
    // 줄에서 바로 답하러 간다: 그 에이전트를 돌리던 앱(되면 그 대화)을 열고, 열어 본 보고로 표시한다
    api('/api/open-app', { app: r.app, id: r.agentId });
    if (!r.read) {
      r.read = true;
      api('/api/read', { id: r.id }).then(refresh);
      inboxSig = '';
      renderInbox();
    }
    return;
  }
  openReport(r);
});
// 확인: 지우지 않고 보고함에서만 뺀다 ('확인한 보고'에서 다시 보거나 되돌릴 수 있다)
function setSeen(ids, seen, all = false) {
  const set = new Set(ids);
  const lis = [...$('inboxList').querySelectorAll('li[data-id]')].filter((li) => set.has(li.dataset.id));
  lis.forEach((li, i) => setTimeout(() => li.classList.add('bye'), Math.min(i, 10) * 25));
  const wait = lis.length ? 220 + Math.min(lis.length, 10) * 25 : 0;
  setTimeout(() => {
    for (const r of lastState.reports || [])
      if (set.has(r.id)) {
        r.seen = seen;
        if (seen) r.read = true;
      }
    inboxSig = '';
    renderInbox();
  }, wait);
  const sent = all ? [api('/api/seen', { all: true, seen })] : ids.map((id) => api('/api/seen', { id, seen }));
  Promise.all(sent).then(() => setTimeout(refresh, wait + 50));
}
// 모두 확인: 나를 기다리는 보고만 남기고 모두 확인한 보고로 보낸다
$('readAll').onclick = () => {
  const byId = agentsById();
  const open = (lastState.reports || []).filter((r) => !r.seen);
  const ids = open.filter((r) => !waitingNow(r, byId)).map((r) => r.id);
  if (ids.length) setSeen(ids, true, ids.length === open.length);
};
$('demoBtn').onclick = () =>
  api('/api/demo', {}).then(() => UI.toast('연습 에이전트가 출근했어요', '13초쯤 일하다가 나한테 보고하러 와요.', 3200));
const setInbox = (open) => {
  $('inbox').classList.toggle('collapsed', !open);
  $('inboxShow').hidden = open;
};
// 상단바에서 펼친 작은 창: 보고함을 펼치면 장면은 위쪽 띠로 줄고, 접으면 방이 크게 보인다 (창 높이는 main.js가 맞춘다)
let miniInboxOpen = !!settings.miniInbox;
let miniInboxTouched = 0;
let unreadSeen = 0;
function setMiniInbox(open, save) {
  miniInboxOpen = open;
  document.body.classList.toggle('ishut', !open);
  const b = $('inboxHide');
  b.textContent = open ? '⌃' : '펼치기 ⌄';
  b.title = open ? '보고함 접기' : '보고함 펼치기';
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-expanded', String(open));
  if (MINI && sceneReady) {
    cam.distT = open ? MINI_DIST.list : MINI_DIST.room; // 띠에서는 가까이 당겨서 캐릭터가 작아지지 않게
    fitScene();
  }
  if (save) {
    miniInboxTouched = Date.now();
    api('/api/settings', { miniInbox: open });
  }
}
if (MINI) {
  setMiniInbox(miniInboxOpen, false);
  $('inboxHide').onclick = (e) => {
    e.stopPropagation();
    setMiniInbox(!miniInboxOpen, true);
  };
  document.querySelector('#inbox .ihead').addEventListener('click', () => {
    if (!miniInboxOpen) setMiniInbox(true, true);
  });
} else {
  $('inboxHide').onclick = () => setInbox(false);
  $('inboxShow').onclick = () => setInbox(true);
}

// 큰 창의 보고함: 화면의 다른 곳을 누르면 옆으로 접는다 (작은 창은 접기 버튼으로만 접는다)
// 대화 창, 캐릭터 카드, 쉬는 에이전트 목록, 꾸미기, 위쪽 상태 묶음과 직원 버튼을 누를 때는 그대로 둔다
const KEEP_INBOX = '#inbox, #inboxShow, .modal, #card, #restPanel, #musicPanel, #avPanel, #avPreview, #statSeg, #staffBtn';
function inboxShut() {
  return $('inbox').classList.contains('collapsed');
}
document.addEventListener('pointerdown', (e) => {
  if (MINI || e.target.closest(KEEP_INBOX)) return;
  if (!inboxShut()) setInbox(false);
});

// 작은 창 고정: 켜 두면 다른 곳을 눌러도 안 닫히고, 맨 윗줄을 끌어서 옮길 수 있다
let pinned = !!settings.pinPopover;
let pinTouched = 0;
function setPin(on, save) {
  pinned = on;
  document.body.classList.toggle('pinned', on);
  $('mPin').setAttribute('aria-pressed', String(on));
  $('mPin').title = on ? '고정 풀기' : '고정하기: 다른 곳을 눌러도 안 닫혀요';
  if (save) {
    pinTouched = Date.now();
    api('/api/settings', { pinPopover: on });
    UI.toast(
      on ? '작은 창을 고정했어요' : '고정을 풀었어요',
      on ? '다른 곳을 눌러도 안 닫혀요. 맨 윗줄을 끌면 옮길 수 있어요.' : '다른 곳을 누르면 다시 접혀요.',
      2600,
    );
  }
}
setPin(pinned, false);
$('mPin').onclick = () => setPin(!pinned, true);

// ---------- 소리, 숨기기, 맵 ----------
let soundOn = settings.sound !== false;
let soundTouched = 0;
function setSound(on, save) {
  soundOn = on;
  $('soundBtn').setAttribute('aria-pressed', String(on));
  $('soundBtn').innerHTML = ico(on ? 'bell' : 'bell-off');
  if (save) {
    soundTouched = Date.now();
    api('/api/settings', { sound: on });
  }
}
setSound(soundOn, false);
$('soundBtn').onclick = () => setSound(!soundOn, true);
let hideTouched = 0;
function setHide(on, save) {
  settings.hideResting = on;
  $('hideBtn').setAttribute('aria-pressed', String(on));
  $('hideBtn').title = on ? '쉬는 에이전트 보이기' : '쉬는 에이전트 숨기기';
  $('restHideAll').checked = on;
  if (on) for (const a of [...agents.values()]) if (a.role === 'rest') leave(a);
  if (save) {
    hideTouched = Date.now();
    api('/api/settings', { hideResting: on }).then(refresh);
    UI.toast(on ? '일 끝나면 바로 퇴근해요' : '일 끝나면 라운지에서 쉬어요', on ? '보고만 하고 집에 가요.' : '쉬는 에이전트도 작업실에 남아요.', 2000);
  }
}
setHide(!!settings.hideResting, false);
$('hideBtn').onclick = (e) => (e.stopPropagation(), toggleRest());
$('mapName').textContent = { office: '작업실', cafe: '카페', stadium: '축구장', paris: '파리' }[MAP_ID];
if (room.pitch) {
  $('fkBtn').hidden = false;
  $('hint').insertAdjacentHTML('beforeend', ' · <kbd>K</kbd> 프리킥');
}
$('mapBtn').onclick = () => toggleDoor(undefined, true);
// 맵을 바꾸면 화면을 잠깐 어둡게 했다가 새 맵을 연다
function goMap(id) {
  if (!['office', 'cafe', 'stadium', 'paris'].includes(id)) return;
  $('mapFade').hidden = false;
  requestAnimationFrame(() => $('mapFade').classList.add('on'));
  setTimeout(() => api('/api/settings', { map: id }).then(() => location.reload()), 280);
}
// ---------- 맵 고르기: 문 앞에서 F를 누르거나, 위쪽 막대의 맵 버튼을 누른다 ----------
let doorOpen = false;
function toggleDoor(force, fromBar = false) {
  doorOpen = force ?? !doorOpen;
  $('doorPanel').hidden = !doorOpen;
  $('mapBtn').setAttribute('aria-expanded', String(doorOpen && fromBar));
  if (!doorOpen) return UI.closeLayer('door');
  // 맵 버튼에서 열면 버튼 아래에, 문 앞에서 열면 화면 아래 가운데에 띄운다
  const P = $('doorPanel');
  const b = fromBar ? $('mapBtn').getBoundingClientRect() : null;
  P.style.top = b ? `${Math.round(b.bottom + 8)}px` : '';
  P.style.left = b ? `${Math.round(clamp(b.left, 10, innerWidth - 430))}px` : '';
  P.style.bottom = b ? 'auto' : '';
  $('doorTitle').textContent = fromBar ? '맵 바꾸기' : '맵 이동하기';
  for (const b of document.querySelectorAll('#doorMaps .mapc')) {
    const here = b.dataset.map === MAP_ID;
    b.disabled = here;
    b.setAttribute('aria-current', String(here));
    b.querySelector('small').textContent = here ? '지금 여기' : b.dataset.desc;
  }
  UI.openLayer('door', () => toggleDoor(false));
  setTimeout(() => document.querySelector('#doorMaps .mapc:not(:disabled)')?.focus(), 30);
}
for (const b of document.querySelectorAll('#doorMaps .mapc')) {
  b.dataset.desc = b.querySelector('small').textContent;
  b.onclick = () => goMap(b.dataset.map);
}
$('doorClose').onclick = () => toggleDoor(false);
$('conn').onclick = () => openSetupModal(2);
$('tutBtn').onclick = () => openSetupModal(1);

// ---------- 튜토리얼 / 연동 설정 팝업 (설정 화면을 앱 안에 띄운다) ----------
let setupOpen = false;
let reloadAfterSetup = false;
function openSetupModal(step = 1) {
  if (MINI) return api('/api/open-window', { setup: step }); // 작은 창은 좁아서 큰 창에서 연다
  $('setupFrame').src = `/setup?t=${encodeURIComponent(TOKEN)}&embed=1&step=${step}`;
  $('setupModal').hidden = false;
  setupOpen = true;
  UI.openLayer('setup', closeSetupModal);
  setTimeout(() => $('setupFrame').focus(), 50);
}
function closeSetupModal() {
  if (!setupOpen) return;
  setupOpen = false;
  $('setupModal').hidden = true;
  $('setupFrame').src = 'about:blank';
  UI.closeLayer('setup');
  if (reloadAfterSetup) location.reload();
  else refresh();
}
$('setupModal').addEventListener('click', (e) => {
  if (e.target === $('setupModal')) closeSetupModal();
});
addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'setup-close') closeSetupModal();
});
window.openSetupFromMain = (step) => !MINI && openSetupModal(step); // 상단바 메뉴에서 부른다
if (!MINI && q.get('open') === 'setup') setTimeout(() => openSetupModal(Number(q.get('step')) || 1), 400);
$('bigBtn').onclick = () => api('/api/open-window', {});
$('menuBtn').onclick = () => api('/api/menu', {});
let actx = null;
function chime(alert) {
  if (!soundOn) return;
  try {
    actx = actx || new AudioContext();
    const now = actx.currentTime;
    const notes = alert ? [[660, 0], [660, 0.18]] : [[880, 0], [1318.5, 0.12]];
    for (const [f, d] of notes) {
      const o = actx.createOscillator();
      const gain = actx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      gain.gain.setValueAtTime(0, now + d);
      gain.gain.linearRampToValueAtTime(0.16, now + d + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + d + 0.5);
      o.connect(gain).connect(actx.destination);
      o.start(now + d);
      o.stop(now + d + 0.55);
    }
  } catch {}
}

// ---------- 카메라: 나를 따라간다 ----------
const MINI_DIST = { room: 20, list: 11.5 }; // 작은 창: 방을 크게 볼 때 / 보고함 위 띠로 볼 때
const dist0 = MINI ? (miniInboxOpen ? MINI_DIST.list : MINI_DIST.room) : 18;
const cam = { yaw: -PI / 4, yawT: -PI / 4, pitch: MINI ? 1.02 : 0.95, dist: dist0, distT: dist0, tx: W / 2 - 0.6, tz: D / 2, focus: null };
sceneReady = true;
if (MINI) fitScene(); // 보고함을 접은 채로 시작하면 장면 상자가 달라져 있다
function updateCamera(dt) {
  cam.yaw = angleDamp(cam.yaw, cam.yawT, 9, dt);
  cam.dist = damp(cam.dist, cam.distT, 9, dt);
  const mx = MINI ? 4.5 : 3;
  // 상태 묶음에서 고른 에이전트를 잠깐 따라간다 (내가 움직이면 바로 나에게 돌아온다)
  let px = me.x;
  let pz = me.z;
  if (cam.focus) {
    const a = agents.get(cam.focus.id);
    cam.focus.t -= dt;
    if (!a || cam.focus.t <= 0 || me.moving) cam.focus = null;
    else [px, pz] = [a.x, a.z];
  }
  cam.tx = damp(cam.tx, clamp(px, mx, W - mx), 3, dt);
  cam.tz = damp(cam.tz, clamp(pz, mx - 0.5, D - mx + 0.5), 3, dt);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, 0.3 + sp * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
  // 1인칭: 위에서 보던 자리에서 내 눈높이까지 0.6초 동안 내려간다 (돌아올 때는 거꾸로)
  fpv.t = fpv.on ? Math.min(1, fpv.t + dt / 0.6) : Math.max(0, fpv.t - dt / 0.6);
  if (fpv.t <= 0) {
    camera.lookAt(cam.tx, 0.3, cam.tz);
    room.setCut(Math.sin(cam.yaw), Math.cos(cam.yaw), true);
    setFov(FOV_TOP);
    showMe(true);
    return;
  }
  const k = fpv.t * fpv.t * (3 - 2 * fpv.t);
  fpv.yaw = angleDamp(fpv.yaw, fpv.yawT, 14, dt);
  me.av.head.getWorldPosition(_eye);
  fpv.eyeY = damp(fpv.eyeY, _eye.y + 0.06, 10, dt); // 걸을 때 머리가 흔들려도 눈높이는 부드럽게
  _eye.set(me.x + Math.sin(fpv.yaw) * 0.12, fpv.eyeY, me.z + Math.cos(fpv.yaw) * 0.12);
  _from.copy(camera.position);
  camera.position.lerpVectors(_from, _eye, k);
  const pc = Math.cos(fpv.pitch);
  _to.set(_eye.x + Math.sin(fpv.yaw) * pc * 4, _eye.y + Math.sin(fpv.pitch) * 4, _eye.z + Math.cos(fpv.yaw) * pc * 4);
  _from.set(cam.tx, 0.3, cam.tz).lerp(_to, k);
  camera.lookAt(_from);
  room.setCut(Math.sin(cam.yaw), Math.cos(cam.yaw), k < 0.5); // 방 안에서는 벽을 다 세운다
  setFov(FOV_TOP + (FOV_EYE - FOV_TOP) * k);
  showMe(k < 0.55); // 내 캐릭터와 이름표는 숨긴다 (머리 속이 보이지 않게)
}
$('rotL').onclick = () => (fpv.on ? (fpv.yawT += PI / 4) : (cam.yawT += PI / 4));
$('rotR').onclick = () => (fpv.on ? (fpv.yawT -= PI / 4) : (cam.yawT -= PI / 4));

// ---------- 1인칭 (V): 내 캐릭터 눈높이에서 보기 ----------
const FOV_TOP = 38;
const FOV_EYE = 70;
const fpv = { on: false, t: 0, yaw: 0, yawT: 0, pitch: -0.06, eyeY: 1.2, hidden: false };
const _eye = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
function setFov(f) {
  if (Math.abs(camera.fov - f) < 0.01) return;
  camera.fov = f;
  camera.updateProjectionMatrix();
}
function showMe(on) {
  if (fpv.hidden === !on) return;
  fpv.hidden = !on;
  me.av.setVisible(on);
  me.lbl.el.style.visibility = on ? '' : 'hidden';
}
function toggleView(force) {
  const on = force ?? !fpv.on;
  if (on === fpv.on) return;
  fpv.on = on;
  $('fpvBtn').setAttribute('aria-pressed', String(on));
  if (!on) return;
  fpv.yaw = fpv.yawT = me.h;
  fpv.pitch = -0.06;
  me.av.head.getWorldPosition(_eye);
  fpv.eyeY = _eye.y + 0.06;
  UI.toast('1인칭으로 봐요', '↑↓로 걷고 ←→로 돌아요. 화면을 끌면 둘러보고, V를 다시 누르면 돌아와요.', 2800);
}

// ---------- 입력 ----------
const keys = new Set();
let runToggle = false;
const typing = () => {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
};
addEventListener('keydown', (e) => {
  if (typing()) return;
  if (e.code === 'Escape') {
    if (FK.on) return endFreeKick();
    if (!UI.closeTop() && fpv.on) toggleView(false);
    return;
  }
  if (UI.blocking()) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  keys.add(e.code);
  if (e.repeat) return;
  if (FK.on && FK.phase === 'aim' && (e.code === 'KeyF' || e.code === 'Enter')) {
    FK.charging = true;
    FK.hold = 0;
    return;
  }
  switch (e.code) {
    case 'Space':
      return jump();
    case 'KeyF':
    case 'Enter':
      return interact();
    case 'Digit1':
      return emote('wave');
    case 'Digit2':
      return emote('heart');
    case 'Digit3':
    case 'KeyZ':
      return toggleDance();
    case 'KeyC':
      return firecracker();
    case 'KeyG':
      return toggleGun();
    case 'KeyV':
      return toggleView();
    case 'KeyK':
      return room.pitch && startFreeKick();
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (FK.charging && (e.code === 'KeyF' || e.code === 'Enter')) fkShoot();
});
addEventListener('blur', () => keys.clear());
for (const b of document.querySelectorAll('[data-skill]'))
  b.addEventListener('click', () => {
    const s = b.dataset.skill;
    if (s === 'wave' || s === 'heart') emote(s);
    else if (s === 'dance') toggleDance();
    else if (s === 'boom') firecracker();
    else if (s === 'gun') toggleGun();
    else if (s === 'jump') jump();
    else if (s === 'view') toggleView();
    else if (s === 'freekick') startFreeKick();
  });
$('runBtn').onclick = () => {
  runToggle = !runToggle;
  $('runBtn').setAttribute('aria-pressed', String(runToggle));
};
$('act').onclick = () => interact();

function updateMe(dt) {
  const can = !UI.blocking() && !typing();
  let f = 0;
  let r = 0;
  if (can) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
  }
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || runToggle;
  if (FK.on && FK.phase !== 'result') f = r = 0; // 프리킥 중에는 방향키로 겨냥만 한다
  if (fpv.on && r) fpv.yawT -= r * 2.4 * dt; // 1인칭: ←→는 제자리에서 돌기 (앉아 있어도 둘러볼 수 있게)
  if (fpv.on ? f : f || r) {
    let mx = fpv.on ? Math.sin(fpv.yaw) * f : -Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * r;
    let mz = fpv.on ? Math.cos(fpv.yaw) * f : -Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * r;
    const l = Math.hypot(mx, mz) || 1;
    mx /= l;
    mz /= l;
    if (me.st) meStand();
    if (me.act === 'dance' || me.act === 'laptop') me.act = '';
    const sp = (run ? 5.0 : 2.8) * (fpv.on && f < 0 ? 0.6 : 1); // 뒷걸음은 조금 느리게
    [me.x, me.z] = collide(me.x + mx * sp * dt, me.z + mz * sp * dt);
    me.moving = run ? 2 : 1;
    if (!fpv.on) me.h = angleDamp(me.h, Math.atan2(mx, mz), 14, dt);
  } else me.moving = 0;
  if (fpv.on && !me.st) me.h = fpv.yaw;
  if (me.y > 0 || me.vy > 0) {
    me.vy -= 20 * dt;
    me.y += me.vy * dt;
    if (me.y <= 0) {
      me.y = 0;
      me.vy = 0;
      me.jumps = 0;
    }
  }
  me.emoteT += dt;
  me.hitT += dt;
  me.twirlT += dt;
  me.fireCd -= dt;
  me.kick = damp(me.kick, 0, 10, dt);
}
function updateAct() {
  const it = UI.blocking() ? null : nearestAct();
  curAct = it;
  const key = it ? it.kind + '|' + it.label : '';
  if (key === actKey) return;
  actKey = key;
  $('act').hidden = !it;
  if (it) $('act').querySelector('span').textContent = it.label;
}

// ---------- 누르기 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(cx, cy) {
  ndc.set(((cx - VB.x) / VB.w) * 2 - 1, -((cy - VB.y) / VB.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [...(fpv.on ? [] : [me.av.hitbox]), ...[...agents.values()].map((a) => a.av.hitbox)];
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return null;
  if (hit.object === me.av.hitbox) return { boss: true };
  for (const a of agents.values()) if (a.av.hitbox === hit.object) return { agent: a };
  return null;
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  hideCard();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
    drag.moved = true;
    canvas.classList.add('dragging');
  }
  if (!drag.moved) return;
  if (fpv.on) {
    fpv.yawT += dx * 0.005;
    fpv.yaw = fpv.yawT;
    fpv.pitch = clamp(fpv.pitch + dy * 0.004, -0.7, 0.55);
    return;
  }
  cam.yawT -= dx * 0.006;
  cam.yaw = cam.yawT;
  cam.pitch = clamp(cam.pitch + dy * 0.004, 0.55, 1.4);
});
// 마우스를 올린 캐릭터: 이름표에 하는 일을 펼치고, 누를 수 있다는 걸 커서로 알린다
let hoverAt = 0;
canvas.addEventListener('pointermove', (e) => {
  if (drag || e.pointerType !== 'mouse') return;
  const now = performance.now();
  if (now - hoverAt < 70) return;
  hoverAt = now;
  const hit = pick(e.clientX, e.clientY);
  hoverId = hit?.agent?.id || null;
  canvas.classList.toggle('pick', !!hit);
});
canvas.addEventListener('pointerleave', () => {
  hoverId = null;
  canvas.classList.remove('pick');
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = drag.moved;
  drag = null;
  canvas.classList.remove('dragging');
  if (moved || e.type === 'pointercancel') return;
  const hit = pick(e.clientX, e.clientY);
  if (hit) return showCard(hit, e.clientX, e.clientY);
  if (me.act === 'gun') fire();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (fpv.on) return;
    cam.distT = clamp(cam.distT + e.deltaY * 0.012, 7, 30);
  },
  { passive: false },
);

let cardAgent = null;
let cardShown = false; // 카드가 떠 있는 동안 그 캐릭터의 이름표를 펼쳐 둔다
// 이름은 글자로 보여 주고, 연필(또는 두 번 누르기)로 바꾼다
function setCardEditing(on) {
  $('card').querySelector('.cname').hidden = on;
  $('cardRename').hidden = on;
  $('cardName').hidden = !on;
  if (on) {
    $('cardName').focus();
    $('cardName').select();
  }
}
function showCard(hit, x, y) {
  const card = $('card');
  const cl = card.querySelector('.cloyal');
  const sf = hit.boss ? null : staffOfAgent(hit.agent.data);
  cl.hidden = !sf;
  if (sf) {
    const next = RANK_AT[sf.rank + 1];
    // 충성도는 맨 아래 한 줄로 (최근에 점수가 바뀐 이유는 올리면 보인다)
    cl.innerHTML = `<span class="rk r${sf.rank}">${RANK_NAMES[sf.rank]}</span><b>충성도 ${sf.pts}</b><span class="lgauge"><i style="width:${sf.pts}%"></i></span><small>${
      next != null ? `${RANK_NAMES[sf.rank + 1]}까지 ${next - sf.pts}점` : '최고 직급'
    }</small>`;
    cl.title = sf.last ? `최근: ${sf.last.why} ${sf.last.delta > 0 ? '+' : ''}${sf.last.delta}` : '';
  }
  setCardEditing(false);
  $('cardName').maxLength = hit.boss ? 16 : 20;
  $('cardName').placeholder = hit.boss ? '나' : hit.agent.data.name || '에이전트';
  $('cardName').setAttribute('aria-label', hit.boss ? '내 이름' : '에이전트 이름');
  let btns;
  let name;
  if (hit.boss) {
    cardAgent = null;
    const n = [...agents.values()].filter((a) => ACTIVE.has(a.data.state)).length;
    name = me.lbl.nm.textContent || '나';
    card.querySelector('.cstat').innerHTML = `<em class="kchip k-boss">사장님</em>${n ? `에이전트 ${n}명이 일하는 중이에요` : '지금은 다들 쉬는 중이에요'}`;
    card.querySelector('.cbody').innerHTML = '<p class="ctip">방향키로 걷고, F로 앉고, V를 누르면 내 눈높이로 봐요.</p>';
    setFace(card.querySelector('.cav'), bossLook);
    btns = `<button type="button" class="btn" data-c="look">${ico('face')}꾸미기</button>`;
  } else {
    const a = hit.agent;
    const d = a.data;
    cardAgent = a;
    name = nameOf(d);
    const kind = a.role === 'rest' ? 'rest' : convoKind(null, d);
    card.querySelector('.cstat').innerHTML = `<em class="kchip k-${kind}">${esc(plainStatus(d, a.role))}</em>${esc([d.app || typeLabel(d.type), d.worktree?.repo].filter(Boolean).join(' · '))}`;
    const rows = [];
    if (nickOf(d.id)) rows.push(['작업', d.name, '']);
    if (d.prompt) rows.push(['받은 일', clean(d.prompt), 'c3']);
    if (ACTIVE.has(d.state) && d.toolHint) rows.push(['지금', d.toolHint, '']);
    else if (d.message && !ACTIVE.has(d.state)) rows.push([kind === 'attention' ? '마지막 말' : '마지막 답', clean(d.message), 'c3']);
    card.querySelector('.cbody').innerHTML = rows.map(([k, v, c]) => `<div class="crow"><span>${k}</span><p${c ? ` class="${c}"` : ''}>${esc(v)}</p></div>`).join('');
    setFace(card.querySelector('.cav'), a.av.look);
    const talk = d.prompt || d.message ? `<button type="button" class="btn${kind === 'attention' ? ' ghost' : ''}" data-c="talk">대화 보기</button>` : '';
    const open =
      d.app && !d.demo
        ? `<button type="button" class="btn${kind === 'attention' || !talk ? '' : ' ghost'}" data-c="app">${kind === 'attention' ? `${esc(d.app)}에서 답하기` : d.canSession ? '세션 열기' : `${esc(d.app)} 열기`}</button>`
        : '';
    btns = (kind === 'attention' ? open + talk : talk + open) + (a.role === 'rest' ? `<button type="button" class="btn ghost cgo" data-c="home">${ico('home')}퇴근시키기</button>` : '');
  }
  card.querySelector('.cname').textContent = name;
  $('cardName').value = name;
  card.querySelector('.cbtns').innerHTML = btns;
  card.hidden = false;
  cardShown = true;
  const box = card.getBoundingClientRect();
  card.style.left = clamp(x + 14, 8, innerWidth - box.width - 8) + 'px';
  card.style.top = clamp(y - 30, 8, innerHeight - box.height - 8) + 'px';
  UI.openLayer('card', hideCard, false);
}
function hideCard() {
  if (!$('cardName').hidden) (cardAgent ? saveAgentName(cardAgent, $('cardName').value) : saveBossName($('cardName').value));
  $('card').hidden = true;
  cardShown = false;
  UI.closeLayer('card');
}
$('cardClose').onclick = hideCard;
$('cardRename').onclick = () => setCardEditing(true);
$('card').querySelector('.cname').addEventListener('dblclick', () => setCardEditing(true));
// 이름 칸을 벗어나거나 Enter, Esc를 누르면 글자로 돌아간다 (저장은 원래 change 처리에서)
function endCardEdit() {
  if ($('card').hidden || $('cardName').hidden) return;
  $('card').querySelector('.cname').textContent = $('cardName').value.trim() || $('cardName').placeholder;
  setCardEditing(false);
}
$('cardName').addEventListener('blur', endCardEdit);
$('cardName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') setTimeout(endCardEdit, 0);
});
$('card').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (!c) return;
  const a = cardAgent;
  hideCard();
  if (c === 'look') openLook();
  else if (c === 'home' && a) sendHome(a);
  else if (c === 'app' && a?.data.app) api('/api/open-app', { app: a.data.app, id: a.id });
  else if (c === 'talk' && a) openAgentConvo(a);
});
function openLook() {
  if (MINI) return api('/api/open-window', { look: true });
  $('avName').value = me.lbl.nm.textContent || '나';
  openEditor(bossLook, (l) => {
    bossLook = normalizeLook(l);
    me.av.setLook(bossLook);
    api('/api/settings', { bossLook });
  });
}
$('lookBtn').onclick = openLook;
window.openLookFromMain = () => !MINI && openLook(); // 작은 창에서 꾸미기를 누르면 main.js가 큰 창에서 부른다

// ---------- 내 이름 바꾸기 (캐릭터 카드, 꾸미기 창) ----------
let nameTouched = 0;
function saveBossName(v) {
  const name = String(v || '').trim().slice(0, 16) || '나';
  if (name === (me.lbl.nm.textContent || '나')) return;
  me.lbl.nm.textContent = name;
  settings.bossName = name;
  nameTouched = Date.now();
  api('/api/settings', { bossName: name });
}
function saveAgentName(a, v) {
  const name = String(v || '').trim().slice(0, 20);
  const val = name === (a.data.name || '') ? '' : name; // 원래 작업 이름과 같으면 붙인 이름을 지운다
  if (nickOf(a.id) === val) return;
  nameNow[a.id] = val;
  api('/api/agent-name', { id: a.id, name: val });
}
for (const id of ['cardName', 'avName']) {
  const inp = $(id);
  const forAgent = () => id === 'cardName' && cardAgent;
  inp.addEventListener('change', () => (forAgent() ? saveAgentName(cardAgent, inp.value) : saveBossName(inp.value)));
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'Escape') {
      inp.value = forAgent() ? nameOf(cardAgent.data) : me.lbl.nm.textContent || '나';
      inp.blur();
    }
  });
}

addEventListener('resize', fitScene);
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b && e.detail > 0) b.blur();
});
setTimeout(() => {
  $('hint').style.opacity = '0';
}, 14000);

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let t = 0;
function updateLabels(now) {
  me.av.labelAnchor(_a);
  place(me.lbl, _a.x, _a.y, _a.z);
  const meIco = me.act === 'gun' ? '🔫' : me.act === 'dance' ? '💃' : '';
  setText(me.lbl.ico, 'icoText', me.lbl, meIco);
  if (me.lbl.bubUntil && now > me.lbl.bubUntil) {
    me.lbl.bub.hidden = true;
    me.lbl.bubUntil = 0;
  }
  for (const a of agents.values()) {
    a.av.labelAnchor(_a);
    const L = a.lbl;
    place(L, _a.x, _a.y, _a.z);
    setText(L.nm, 'nmText', L, short(nameOf(a.data), 18));
    const s = labelState(a);
    if (L.state !== s) {
      L.state = s;
      L.el.dataset.s = s;
    }
    setText(L.st, 'stText', L, s === 'attn' ? (a.data.state === 'blocked' ? '허락 필요' : '답 필요') : '');
    const sub = statusText(a.data, a.role);
    const icon = statusIco(a.data, a.role);
    if (L.subKey !== icon + sub) {
      L.subKey = icon + sub;
      L.sub.innerHTML = sub ? ico(icon) + esc(sub) : '';
    }
    const hov = a.id === hoverId || (cardShown && a === cardAgent);
    if (L.hov !== hov) {
      L.hov = hov;
      L.el.classList.toggle('hov', hov);
    }
    if (L.bubUntil && now > L.bubUntil) {
      L.bub.hidden = true;
      L.bubUntil = 0;
    }
  }
}
// 렉 방지: 뭔가 움직일 때만 1초에 60번, 가만히 있으면 30번 그린다
let lastDraw = 0;
let drawNo = 0;
const lively = () =>
  keys.size > 0 ||
  me.moving > 0 ||
  me.y > 0 ||
  !!drag?.moved ||
  (fpv.t > 0 && fpv.t < 1) ||
  (fpv.on && Math.abs(fpv.yaw - fpv.yawT) > 0.001) ||
  !!room.ball?.moving() ||
  FK.on ||
  [...agents.values()].some((a) => a.mode === 'walk' || a.role === 'report');
const lastMe = { x: me.x, z: me.z };
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  // 다른 앱을 쓰는 중이어도 화면에 보이는 동안은 부드럽게 (가려지거나 최소화되면 브라우저가 알아서 멈춘다)
  const fps = lively() ? 60 : 30;
  if (now - lastDraw < 1000 / fps - 4) return;
  lastDraw = now;
  // 그림자는 가구만 만든다 (캐릭터는 동그란 그림자) → 가끔만 다시 그리면 된다
  if (drawNo++ % 60 === 0 || Math.abs(cam.yaw - cam.yawT) > 0.002) renderer.shadowMap.needsUpdate = true; // 카메라를 돌리는 동안은 바로바로
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  updateMe(dt);
  for (const a of agents.values()) {
    if (a.mode === 'walk') stepWalk(a, dt);
    const rk = rankOfAgent(a.data);
    a.moving = a.mode === 'walk' ? (a.role === 'report' && rk >= 2 ? 2 : 1) : 0;
    const s = a.data.state;
    a.act = a.role === 'work' && a.st === 1 && s === 'working' ? 'laptop' : a.role === 'report' && rk >= 3 ? 'coffee' : ''; // 과장부터 커피 들고 보고
    if (ATTN.has(s) && a.role === 'work' && a.mode !== 'walk' && a.emoteT > 2.4) {
      a.emote = 'wave';
      a.emoteT = 0;
    }
    a.emoteT += dt;
    a.hitT += dt;
    a.av.root.position.set(a.x, 0, a.z);
    a.av.root.rotation.y = a.h;
    a.av.update(dt, { t, moving: a.moving, air: false, st: a.st, seat: a.seat, act: a.act, dn: 0, emote: a.emote, emoteT: a.emoteT, hitT: a.hitT });
  }
  // 축구장 공: 나와 에이전트가 움직인 만큼 밀고, 굴리고, 골을 본다
  if (room.ball) {
    updateFreeKick(dt);
    const bodies = [{ x: me.x, z: me.z, vx: (me.x - lastMe.x) / dt, vz: (me.z - lastMe.z) / dt }];
    if (FK.on) bodies.push(...FK.dBodies, FK.kBody);
    else for (const a of agents.values()) bodies.push({ x: a.x, z: a.z, vx: (a.x - (a.lx ?? a.x)) / dt, vz: (a.z - (a.lz ?? a.z)) / dt });
    room.ball.update(dt, bodies);
    lastMe.x = me.x;
    lastMe.z = me.z;
    for (const a of agents.values()) {
      a.lx = a.x;
      a.lz = a.z;
    }
  }
  me.av.root.position.set(me.x, me.y, me.z);
  me.av.root.rotation.y = me.h;
  me.av.update(dt, {
    t,
    moving: me.moving,
    air: me.y > 0.01,
    st: me.st,
    seat: me.seat,
    act: me.act,
    dn: me.dn,
    emote: me.emote,
    emoteT: me.emoteT,
    kick: me.kick,
    hitT: me.hitT,
    twirl: me.twirlT < 0.45 ? 1 - (1 - me.twirlT / 0.45) ** 2 : 0,
  });
  fx.update(dt, blockedAt, hitTest);
  room.update(dt, t);
  updateCamera(dt);
  updateAct();
  renderer.render(scene, camera);
  updateLabels(performance.now());
}

updateCamera(0.016);
renderer.shadowMap.needsUpdate = true;
renderer.render(scene, camera);
requestAnimationFrame(frame);
setTimeout(() => $('loading').classList.add('done'), 150);
if (!MINI && q.get('open') === 'look') setTimeout(openLook, 500); // 작은 창에서 꾸미기를 눌러 큰 창이 새로 열린 경우
// ---------- 직급 배지, 승진, 직원 명부 ----------
function updateRankTags() {
  for (const a of agents.values()) {
    const sf = staffOfAgent(a.data);
    const r = sf ? sf.rank : -1;
    if (a.rankShown === r) continue;
    a.rankShown = r;
    a.lbl.rk.textContent = r >= 0 ? RANK_NAMES[r] : '';
    a.lbl.rk.className = `rk r${r}`;
    a.lbl.tag.classList.toggle('gold', r === 5);
  }
}
const promoSeen = new Set();
function checkPromos(st, first) {
  for (const pr of st.promos || []) {
    if (promoSeen.has(pr.id)) continue;
    promoSeen.add(pr.id);
    if (first || Date.now() - pr.at > 60000) continue;
    // 승진은 그 캐릭터 머리 위 말풍선과 폭죽으로 알린다 (작업실에 없을 때만 알림 쪽지)
    const a = [...agents.values()].find((x) => x.data.staffKey === pr.key);
    if (a) showBubble(a.lbl, `${ro(pr.title)} 승진했어요!`, 'promo', 4200);
    else UI.toast(pr.name, `${ro(pr.title)} 승진했어요!`, 3800);
    const x = a ? a.x : me.x;
    const z = a ? a.z : me.z;
    for (let i = 0; i < 4; i++) setTimeout(() => fx.burst(x + (Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 0.6, z + (Math.random() - 0.5) * 1.2, 40), i * 260);
    chime();
  }
}
let staffSig = '';
// 보고함 안에서 보기 바꾸기: 보고함, 확인한 보고, 직원 명부
function setInboxView(v) {
  inboxView = v;
  $('inbox').dataset.show = v;
  document.body.classList.toggle('staffv', v === 'staff');
  $('staffView').hidden = v !== 'staff';
  $('inboxList').hidden = v === 'staff';
  $('inboxBack').hidden = v === 'reports';
  $('inboxTitle').textContent = v === 'staff' ? '직원 명부' : v === 'seen' ? '확인한 보고' : '보고함';
  for (const id of ['staffBtn', 'iStaff']) $(id).setAttribute('aria-pressed', String(v === 'staff'));
  inboxSig = '';
  staffSig = '';
  renderInbox();
  renderStaff();
  $('inboxList').scrollTop = 0;
}
$('inboxBack').onclick = (e) => {
  e.stopPropagation();
  setInboxView('reports');
};
function toggleStaff() {
  const on = inboxView !== 'staff';
  if (on) MINI ? setMiniInbox(true, true) : setInbox(true);
  setInboxView(on ? 'staff' : 'reports');
}
$('staffBtn').onclick = toggleStaff;
$('iStaff').onclick = (e) => {
  e.stopPropagation();
  toggleStaff();
};
function renderStaff() {
  if (inboxView !== 'staff') return;
  const list = Object.entries(lastState.staff || {}).sort((p, q) => q[1].pts - p[1].pts);
  const sig = JSON.stringify(list.map(([k, v]) => [k, v.pts, v.today]));
  if (sig === staffSig) return;
  staffSig = sig;
  const mvp = list.filter(([, v]) => v.today > 0).sort((p, q) => q[1].today - p[1].today)[0];
  $('mvp').innerHTML = `<span class="mvpic">${ico('trophy')}</span><span><small>오늘의 MVP</small><b>${mvp ? esc(mvp[1].name) : '아직 없어요'}</b><em>${
    mvp ? `오늘 +${mvp[1].today}점` : '보고를 빨리 확인해 주면 점수가 올라요'
  }</em></span>`;
  $('staffList').innerHTML = list.length
    ? list
        .map(([, v], i) => {
          const next = RANK_AT[v.rank + 1];
          return `<li><span class="sno">${i + 1}</span><span class="rk r${v.rank}">${RANK_NAMES[v.rank]}</span><b>${esc(v.name)}</b><small>${v.pts}점${
            next != null ? ` · ${RANK_NAMES[v.rank + 1]}까지 ${next - v.pts}점` : ' · 최고 직급'
          }${v.today ? ` · 오늘 ${v.today > 0 ? '+' : ''}${v.today}` : ''}</small><div class="lgauge"><i style="width:${v.pts}%"></i></div></li>`;
        })
        .join('')
    : '<li class="empty">에이전트가 일을 하면<br>여기에 직원으로 올라와요.</li>';
}

// ---------- 쉬는 에이전트: 목록에서 골라 퇴근시키기 ----------
let restOpen = false;
let restSig = '';
const restingNow = () =>
  (lastState.agents || [])
    .filter((d) => !isBusy(d.state) && Date.now() - (d.updatedAt || 0) < RECENT_MS)
    .sort((p, q) => (q.updatedAt || 0) - (p.updatedAt || 0));
function toggleRest(force) {
  restOpen = force ?? !restOpen;
  $('restPanel').hidden = !restOpen;
  $('hideBtn').setAttribute('aria-expanded', String(restOpen));
  if (restOpen) {
    const b = $('hideBtn').getBoundingClientRect();
    const P = $('restPanel');
    P.style.top = `${Math.round(b.bottom + 8)}px`;
    P.style.right = `${Math.max(10, Math.round(innerWidth - b.right))}px`;
    restSig = '';
    renderRest();
    UI.openLayer('rest', () => toggleRest(false), false);
  } else UI.closeLayer('rest');
}
function renderRest() {
  const list = restingNow();
  const awake = list.filter((d) => !wentHome(d) && !settings.hideResting);
  // 버튼의 숫자: 작업실에 남아 쉬는 에이전트
  const n = awake.length;
  $('hideBtn').innerHTML = `${ico('rest')}<span class="w">쉬는 에이전트</span>${n ? `<b class="rc">${n}</b>` : ''}`;
  if (!restOpen) return;
  const sig = JSON.stringify([list.map((d) => [d.id, wentHome(d)]), settings.hideResting, Math.floor(Date.now() / 60000)]);
  if (sig === restSig) return;
  restSig = sig;
  $('restCount').textContent = list.length ? `${list.length}명` : '';
  $('restHideAll').checked = !!settings.hideResting;
  $('restList').innerHTML = list.length
    ? list
        .map((d) => {
          const home = wentHome(d) || settings.hideResting;
          const sub = [d.app || typeLabel(d.type), d.worktree?.repo, ago(d.updatedAt)].filter(Boolean).join(' · ');
          const sub2 = [nickOf(d.id) ? d.name : '', sub].filter(Boolean).join(' · ');
          return `<li class="${home ? 'home' : ''}"><label><input type="checkbox" data-id="${esc(d.id)}" ${home ? 'disabled' : ''}><span class="rt"><b>${esc(nameOf(d))}</b><small>${esc(sub2)}</small></span></label>${
            home ? (settings.hideResting ? '<span class="gone">퇴근함</span>' : `<button type="button" class="btn ghost sm" data-back="${esc(d.id)}">다시 부르기</button>`) : ''
          }</li>`;
        })
        .join('')
    : '<li class="empty">지금 쉬는 에이전트가 없어요.</li>';
  restPick();
}
function restPick() {
  const boxes = [...$('restList').querySelectorAll('input[data-id]:not(:disabled)')];
  const n = boxes.filter((b) => b.checked).length;
  $('restGo').disabled = !n;
  $('restGo').textContent = n ? `${n}명 퇴근시키기` : '퇴근시키기';
  $('restAll').checked = boxes.length > 0 && n === boxes.length;
  $('restAll').disabled = !boxes.length;
}
$('restList').addEventListener('change', restPick);
$('restAll').addEventListener('change', (e) => {
  for (const b of $('restList').querySelectorAll('input[data-id]:not(:disabled)')) b.checked = e.target.checked;
  restPick();
});
$('restGo').onclick = () => {
  const ids = [...$('restList').querySelectorAll('input[data-id]:checked')].map((b) => b.dataset.id);
  for (const id of ids) {
    const a = agents.get(id);
    const d = (lastState.agents || []).find((x) => x.id === id);
    if (!d) continue;
    if (a) sendHome(a, true);
    else {
      homeNow[id] = d.stateStartedAt || 0;
      api('/api/send-home', { id, since: d.stateStartedAt || 0 });
    }
  }
  if (ids.length) UI.toast(`${ids.length}명 퇴근했어요`, '새 일을 받으면 다시 출근해요.', 2400);
  restSig = '';
  renderRest();
};
$('restList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-back]');
  if (!b) return;
  const id = b.dataset.back;
  delete homeNow[id];
  if (settings.sentHome) delete settings.sentHome[id];
  api('/api/send-home', { id, back: true }).then(refresh);
  restSig = '';
  renderRest();
});
$('restHideAll').addEventListener('change', (e) => {
  setHide(e.target.checked, true);
  restSig = '';
  renderRest();
});
$('restClose').onclick = () => toggleRest(false);
document.addEventListener('pointerdown', (e) => {
  if (restOpen && !e.target.closest('#restPanel, #hideBtn')) toggleRest(false);
  if (musicPanelOpen && !e.target.closest('#musicPanel, #musicBtn')) toggleMusicPanel(false);
  if (doorOpen && !e.target.closest('#doorPanel, #act, #mapBtn')) toggleDoor(false);
  if (skillsOpen && !e.target.closest('#skills, #skillBtn')) toggleSkills(false);
  if (updOpen && !e.target.closest('#updPanel, #updBtn')) toggleUpd(false);
});

// ---------- 업데이트 안내: 쓰던 사람이 새 버전을 처음 열 때 한 번만 뜬다 ----------
// 이름표가 간단해진 것을 알리고, 예전처럼 직급과 하는 일을 늘 보는 설정을 그 자리에서 켤 수 있게 한다
let tagTouched = 0;
function setTagDetail(on, save) {
  document.body.classList.toggle('tagd', on);
  $('newsTag').checked = on;
  if (save) {
    tagTouched = Date.now();
    settings.tagDetail = on;
    api('/api/settings', { tagDetail: on });
  }
}
let newsOpen = false;
let newsDone = false; // 닫은 뒤 서버에 저장되기 전까지 다시 뜨지 않게
function showNews(on) {
  if (on && newsDone) return;
  if (on === newsOpen) return;
  newsOpen = on;
  $('newsPanel').hidden = !on;
  if (on) UI.openLayer('news', closeNews, false);
  else UI.closeLayer('news');
}
function closeNews() {
  newsDone = true;
  showNews(false);
  api('/api/settings', { newsSeen: true });
}
$('newsTag').onchange = (e) => setTagDetail(e.target.checked, true);
$('newsOk').onclick = closeNews;
$('newsClose').onclick = closeNews;

// ---------- 동작 창: 인사, 춤, 1인칭 같은 버튼을 '동작' 하나로 접어 둔다 (단축키는 늘 먹는다) ----------
let skillsOpen = false;
function toggleSkills(force) {
  skillsOpen = force ?? !skillsOpen;
  $('skills').hidden = !skillsOpen;
  $('skillBtn').setAttribute('aria-expanded', String(skillsOpen));
  if (!skillsOpen) return UI.closeLayer('skills');
  $('hint').style.opacity = '0'; // 조작법은 동작 창 아래에 적혀 있다
  UI.openLayer('skills', () => toggleSkills(false), false);
}
$('skillBtn').onclick = () => toggleSkills();
$('skillClose').onclick = () => toggleSkills(false);

// ---------- 작업실 라디오: '음악' 버튼 아래 작은 팝업 (소리는 main.js의 숨은 창에서 만든다) ----------
let musicPanelOpen = false;
let radioNow = { on: false, station: 'lofi', volume: 0.6 };
let radioTouched = 0;
function placeMusicPanel() {
  const b = $('musicBtn').getBoundingClientRect();
  const P = $('musicPanel');
  P.style.top = `${Math.round(b.bottom + 8)}px`;
  P.style.right = `${Math.max(10, Math.round(innerWidth - b.right))}px`;
}
function toggleMusicPanel(force) {
  if (MINI) return api('/api/open-window', { music: true }); // 작은 창에서는 큰 창을 열어 보여 준다
  musicPanelOpen = force ?? !musicPanelOpen;
  $('musicPanel').hidden = !musicPanelOpen;
  $('musicBtn').setAttribute('aria-expanded', String(musicPanelOpen));
  if (!musicPanelOpen) {
    hideYT();
    return UI.closeLayer('music');
  }
  placeMusicPanel();
  showRadio(radioNow, true);
  setMusicTab(musicTab);
  UI.openLayer('music', () => toggleMusicPanel(false), false);
}
const STATION_KO = { lofi: '로파이', piano: '피아노', rain: '빗소리', focus: '집중 소음' };
function showRadio(r, force) {
  if (!r) return;
  // 방금 직접 바꿨으면 서버 값이 따라올 때까지 잠깐 기다린다 (슬라이더가 튀지 않게)
  if (!force && Date.now() - radioTouched < 1500) return;
  radioNow = { on: !!r.on, station: r.station || 'lofi', volume: Number.isFinite(r.volume) ? r.volume : 0.6 };
  updateMusicBtn();
  for (const b of document.querySelectorAll('#musicPanel .rst')) b.setAttribute('aria-pressed', String(b.dataset.st === radioNow.station));
  $('radioPlay').textContent = radioNow.on ? '멈춤' : '재생';
  $('radioVol').value = String(Math.round(radioNow.volume * 100));
}
function radioSend(r) {
  radioTouched = Date.now();
  radioNow = { ...radioNow, ...r };
  showRadio(radioNow, true);
  return api('/api/radio', r).catch(() => {});
}
$('musicBtn').onclick = () => toggleMusicPanel();
$('musicClose').onclick = () => toggleMusicPanel(false);
for (const b of document.querySelectorAll('#musicPanel .rst')) b.onclick = () => radioSend({ on: true, station: b.dataset.st });
$('radioPlay').onclick = () => radioSend({ on: !radioNow.on, station: radioNow.station });
let volTimer = 0;
$('radioVol').oninput = (e) => {
  const v = Number(e.target.value) / 100;
  radioTouched = Date.now();
  radioNow.volume = v;
  clearTimeout(volTimer);
  volTimer = setTimeout(() => api('/api/radio', { volume: v }).catch(() => {}), 80);
};
addEventListener('resize', () => {
  if (!musicPanelOpen) return;
  placeMusicPanel();
  placeYT();
});
// ---------- 음악 칸의 탭: 작업실 라디오 / YouTube ----------
let musicTab = localStorage.getItem('musicTab') === 'yt' ? 'yt' : 'radio';
function setMusicTab(tab) {
  musicTab = tab;
  localStorage.setItem('musicTab', tab);
  for (const b of document.querySelectorAll('#musicPanel .mtab')) b.setAttribute('aria-selected', String(b.dataset.src === tab));
  $('radioView').hidden = tab !== 'radio';
  $('ytView').hidden = tab !== 'yt';
  if (tab === 'yt' && musicPanelOpen) {
    placeYT();
    if (!ytNow.on) {
      if (!$('ytUrl').value) $('ytUrl').value = localStorage.getItem('ytUrl') || '';
      setTimeout(() => $('ytUrl').focus(), 60);
    }
  } else hideYT();
}
function updateMusicBtn() {
  $('musicBtn').setAttribute('aria-pressed', String(radioNow.on || ytNow.on));
  $('musicState').textContent = radioNow.on ? `${STATION_KO[radioNow.station] || ''} 재생 중` : ytNow.on ? 'YouTube 재생 중' : '';
}
// ---------- YouTube 칸: 링크를 넣으면 영상 칸에 작게 튼다 (칸을 접어도 소리는 계속) ----------
let ytNow = { on: false, title: '' };
let ytTouched = 0;
function placeYT() {
  if (!musicPanelOpen || musicTab !== 'yt' || !ytNow.on) return;
  const r = $('ytStage').getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  api('/api/youtube', { action: 'show', rect: { x: Math.max(0, r.left), y: Math.max(0, r.top), w: r.width, h: r.height } }).catch(() => {});
}
function hideYT() {
  if (ytNow.on) api('/api/youtube', { action: 'hide' }).catch(() => {});
}
function showYT(y, force) {
  if (!y || (!force && Date.now() - ytTouched < 2500)) return;
  const turnedOn = !!y.on && !ytNow.on;
  ytNow = { on: !!y.on, title: y.title || '' };
  $('ytStage').classList.toggle('on', ytNow.on);
  $('ytFoot').hidden = !ytNow.on;
  $('ytTitle').textContent = ytNow.title || '불러오는 중…';
  $('ytTitle').title = ytNow.title;
  updateMusicBtn();
  if (turnedOn) placeYT();
}
$('ytForm').onsubmit = async (e) => {
  e.preventDefault();
  const url = $('ytUrl').value.trim();
  if (!url) return $('ytUrl').focus();
  const r = await api('/api/youtube', { action: 'play', url }).catch(() => null);
  $('ytErr').hidden = !!r?.ok;
  if (!r?.ok) return;
  localStorage.setItem('ytUrl', url);
  ytTouched = Date.now();
  radioNow.on = false; // 라디오는 main이 끈다
  showRadio(radioNow, true);
  showYT({ on: true, title: '' }, true);
  placeYT();
};
$('ytUrl').oninput = () => ($('ytErr').hidden = true);
$('ytStop').onclick = () => {
  ytTouched = Date.now();
  api('/api/youtube', { action: 'stop' }).catch(() => {});
  showYT({ on: false }, true);
};
$('musicPanel').addEventListener('animationend', placeYT);
// 영상 칸의 크기가 바뀌면 YouTube 화면도 다시 맞춘다
new ResizeObserver(() => placeYT()).observe($('ytStage'));
for (const b of document.querySelectorAll('#musicPanel .mtab')) b.onclick = () => setMusicTab(b.dataset.src);
// ---------- 업데이트 버튼: 새 버전이 있을 때만 켜진다 (누르면 받아서 바꾸고 앱이 다시 켜진다) ----------
let updNow = { state: 'idle' };
let updOpen = false;
function placeUpdPanel() {
  const b = $('updBtn').getBoundingClientRect();
  $('updPanel').style.top = `${Math.round(b.bottom + 8)}px`;
  $('updPanel').style.right = `${Math.max(10, Math.round(innerWidth - b.right))}px`;
}
function toggleUpd(force) {
  updOpen = force ?? !updOpen;
  $('updPanel').hidden = !updOpen;
  if (!updOpen) return UI.closeLayer('upd');
  placeUpdPanel();
  UI.openLayer('upd', () => toggleUpd(false), false);
}
function showUpd(u) {
  if (!u) return;
  updNow = u;
  const busy = ['downloading', 'installing', 'restarting'].includes(u.state);
  const on = u.state === 'available' || busy;
  $('updBtn').hidden = !on || MINI;
  if (!on) {
    if (updOpen) toggleUpd(false);
    return;
  }
  const pct = Math.round((u.progress || 0) * 100);
  $('updBtn').querySelector('.w').textContent = busy ? `업데이트 ${pct}%` : '업데이트';
  $('updVer').textContent = u.current ? `${u.current} → ${u.version}` : u.version;
  $('updNotes').innerHTML = (u.notes || []).map((n) => `<li>${esc(n)}</li>`).join('');
  $('updNotes').hidden = !(u.notes || []).length;
  $('updBar').hidden = !busy;
  $('updBar').querySelector('i').style.width = `${pct}%`;
  $('updGo').disabled = busy;
  $('updGo').textContent =
    u.state === 'downloading' ? `받는 중 ${pct}%` : u.state === 'installing' ? '설치하는 중…' : u.state === 'restarting' ? '다시 켜는 중…' : '업데이트';
  $('updErr').hidden = !u.error;
  $('updErr').textContent = u.error || '';
}
$('updBtn').onclick = () => toggleUpd();
$('updClose').onclick = () => toggleUpd(false);
$('updGo').onclick = () =>
  api('/api/update', { action: 'install' })
    .then((r) => r?.update && showUpd({ ...updNow, ...r.update }))
    .catch(() => {});
addEventListener('resize', () => updOpen && placeUpdPanel());
// 상단바 메뉴에서 부른다 (tab: 'radio' | 'yt', 없으면 마지막에 보던 칸)
window.openMusicFromMain = (tab) => {
  if (['radio', 'yt'].includes(tab)) musicTab = tab;
  toggleMusicPanel(true);
};
if (!MINI && q.get('open') === 'music') setTimeout(() => window.openMusicFromMain(q.get('tab')), 500);

// 점검용: 주소에 debug=1이 있을 때만 내부 상태를 꺼내 본다 (자동 점검 스크립트에서 쓴다)
if (q.get('debug') === '1') window.__ao = { agents, me, used, room, NEAR_BOSS, rank: rankOfAgent, state: () => lastState, showCard, hideCard, goMap, setInboxView };

if (boot && Array.isArray(boot.agents) && boot.at) sync(boot);
setInterval(refresh, 1000);
setInterval(() => {
  renderInbox();
  drawStatus(lastState);
}, 30000);
