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
  // 생제르맹 데프레: 카페 테라스에서 일하고, 공원 벤치와 보도에서 쉰다. 출근은 메트로로
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
function makeLabel(kind) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<div class="bub" hidden></div><div class="tag ${kind}"><span class="ico"></span><span class="rk"></span><span class="nm"></span></div><div class="sub"></div>`;
  $('labels').appendChild(el);
  if (kind === 'boss') el.querySelector('.rk').textContent = '사장님';
  return { el, tag: el.querySelector('.tag'), bub: el.querySelector('.bub'), ico: el.querySelector('.ico'), rk: el.querySelector('.rk'), nm: el.querySelector('.nm'), sub: el.querySelector('.sub'), vis: null, bubUntil: 0 };
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
  // 머리줄 아래에서 서서히 나타나게 (이름표 아래 끝이 위쪽 100px 안이면 흐리게)
  const op = sy < 100 ? Math.max(0, Math.min(1, (sy - 60) / 40)) : 1;
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
  UI.toast(`💃 ${DANCES[dn]}`, '3을 다시 누르거나 움직이면 멈춰요.', 1800);
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
    UI.toast('🔫 종이 총을 꺼냈어요', MINI ? '클릭이나 F로 발사! G로 넣어요.' : '클릭이나 F로 발사! 에이전트를 맞혀 봐요. G로 넣어요.', 2200);
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
  if (me.act === 'gun') return { kind: 'fire', label: '종이 총 발사' };
  if (me.st) return { kind: 'stand', label: '일어나기' };
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
  return best;
}
function interact() {
  const it = curAct;
  if (!it) return;
  if (it.kind === 'fire') fire();
  else if (it.kind === 'stand') meStand();
  else if (it.kind === 'seat') meSit(it.seat);
  else if (it.kind === 'agent') {
    const p = projectToScreen(it.agent.x, 1.2, it.agent.z);
    showCard({ agent: it.agent }, p.x, p.y);
  }
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
  if (!quiet) UI.toast(`🏠 ${nameOf(a.data)}`, '오늘은 퇴근했어요. 새 일을 받으면 다시 출근해요.', 2400);
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
const clean = (s) => String(s || '').replace(/[*`#>_~|]/g, '').replace(/\s+/g, ' ').trim();
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
  // 작은 창에서는 이름표와 보고함 줄이 알려 주니 알림 쪽지를 띄우지 않는다 (위쪽이 겹치지 않게)
  if (!MINI) UI.toast(`${r.kind === 'interrupted' ? '⏸' : '✅'} ${nickOf(r.agentId) || r.name}`, '보고하러 가는 중이에요', 2600);
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
  if (role === 'report') return '📣 보고하러 가는 중';
  if (role === 'leave') return '👋 퇴근하는 중';
  switch (d.state) {
    case 'working':
      return d.tool ? `💻 ${TOOL_KO[d.tool] || `${d.tool} 쓰는 중`}` : '💭 생각하는 중';
    case 'monitoring':
      return '👀 지켜보는 중';
    case 'waiting':
      return '❗ 답을 기다려요';
    case 'blocked':
      return '❗ 허락이 필요해요';
    case 'done':
      return d.interrupted ? '⏸ 중단됐어요' : '💤 쉬는 중';
    case 'idle':
      return '💤 쉬는 중';
    default:
      return '';
  }
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
  Object.assign(settings, s);
}

function sync(st) {
  lastState = st;
  applySettings(st.settings);
  showMusicState(st.music);
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
      if (!MINI) UI.toast(`❗ ${nickOf(r.agentId) || r.name}`, '권한이 필요해요. 자리에서 손을 들고 있어요.', 3500);
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
  for (const [id, n] of [['cWork', work], ['cAttn', attn], ['cDone', done], ['mWork', work], ['mAttn', attn], ['mDone', done]]) {
    $(id).querySelector('b').textContent = n;
    $(id).classList.toggle('zero', !n);
  }
  const conn = $('conn');
  const src = st.sources || {};
  const names = [src.orca && 'Orca', src.claude && 'Claude', src.codex && 'Codex'].filter(Boolean);
  conn.querySelector('.ct').textContent = names.length ? names.join(' · ') : '볼 수 있는 앱이 없어요';
  conn.title = `${names.length ? `보는 중: ${names.join(', ')}` : '볼 수 있는 앱이 없어요'}${st.error ? `\nOrca: ${st.error}` : ''}\n누르면 연동 설정이 열려요`;
  conn.classList.toggle('off', !names.length);
  const u = st.unread || 0;
  $('unreadCnt').textContent = u || '';
  $('unreadCnt2').textContent = u || '';
  // 보고함을 접어 둔 작은 창: 새 보고가 오면 접힌 줄을 한 번 반짝인다
  if (MINI && !miniInboxOpen && u > unreadSeen) {
    const el = $('inbox');
    el.classList.remove('ping');
    void el.offsetWidth;
    el.classList.add('ping');
  }
  unreadSeen = u;
  document.title = u ? `(${u}) 에이전트 작업실` : '에이전트 작업실';
}

let inboxFilter = 'all';
let inboxSig = '';
// 접힌 보고함 줄에 보여 줄 한 줄: 안 읽은 보고가 있으면 그것, 없으면 가장 최근 보고
function renderPeek() {
  const all = lastState.reports || [];
  const r = all.find((x) => !x.read && !x.seen) || all.find((x) => !x.seen);
  const t = r ? `${kindIco(r.kind)}${esc(nickOf(r.agentId) || r.name)} · ${ago(r.at)}` : all.length ? '새 보고가 없어요' : '아직 받은 보고가 없어요';
  if ($('inboxPeek').innerHTML !== t) $('inboxPeek').innerHTML = t;
}
function renderInbox() {
  if (MINI) renderPeek();
  const all = lastState.reports || [];
  const FILTERS = {
    all: (r) => !r.seen,
    unread: (r) => !r.seen && !r.read,
    attention: (r) => !r.seen && r.kind === 'attention',
    seen: (r) => r.seen,
  };
  const list = all.filter(FILTERS[inboxFilter] || FILTERS.all);
  const sig = JSON.stringify([inboxFilter, list.map((r) => [r.id, r.read]), Math.floor(Date.now() / 60000)]);
  if (sig === inboxSig) return;
  inboxSig = sig;
  if (!list.length) {
    const empty =
      inboxFilter === 'seen'
        ? '봤어요 처리한 보고가 여기 모여요.'
        : inboxFilter !== 'all'
          ? '여기는 비어 있어요.'
          : all.length
            ? '다 봤어요 👏<br>본 보고는 \'본 것\' 탭에 있어요.'
            : '에이전트가 일을 끝낼 때마다<br>여기에 보고가 쌓여요.<br>🧪 연습을 눌러 미리 볼 수도 있어요.';
    $('inboxList').innerHTML = `<li class="empty">${empty}</li>`;
    return;
  }
  $('inboxList').innerHTML = list
    .map((r) => {
      const ic = kindIco(r.kind);
      const where = [r.app, r.repo, r.branch].filter(Boolean).join(' · ');
      const text = r.kind === 'attention' ? '답이나 허락을 기다리고 있어요' : clean(r.message) || '보고 내용이 없어요';
      const act = r.seen
        ? `<button type="button" class="iact" data-act="unsee" title="보고함 목록으로 되돌려요">${ico('undo')}되돌리기</button>`
        : `<button type="button" class="iact" data-act="seen" title="목록에서 빼요. '본 것' 탭에서 다시 볼 수 있어요.">${ico('check')}봤어요</button>`;
      const nick = nickOf(r.agentId);
      const at = [nick ? r.name : '', where].filter(Boolean).join(' · '); // 이름을 붙였으면 작업 이름은 아래 줄로
      return `<li class="k-${r.kind}${r.read ? '' : ' unread'}" data-id="${esc(r.id)}"><span class="ic">${ic}</span><b>${esc(nick || r.name)}</b><small>${esc(at)}${at ? ' · ' : ''}${ago(r.at)}</small><p>${esc(text)}</p>${act}</li>`;
    })
    .join('');
}

let statusSig = '';
function drawStatus(st) {
  const ags = st.agents || [];
  const info = {
    work: ags.filter((d) => ACTIVE.has(d.state)).map((d) => ({ name: nameOf(d), sub: [d.app, statusText(d).replace(/^\S+\s/, '')].filter(Boolean).join(' · ') })),
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
    ['🛠 일하는 중', info.work, '#3D6FD8'],
    ['❗ 확인 필요', info.attn, '#E5484D'],
    ['✅ 오늘 끝남', info.done, '#2E8B57'],
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

// ---------- 보고 자세히 ----------
let openReportId = null;
function openReport(r) {
  openReportId = r.id;
  const icon = $('rIcon');
  icon.innerHTML = kindIco(r.kind);
  icon.className = `ricon k-${r.kind}`;
  $('rTitle').textContent = nickOf(r.agentId) || r.name;
  $('rMeta').textContent = [r.app || typeLabel(r.type), r.repo, r.branch, `${new Date(r.at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}`]
    .filter(Boolean)
    .join(' · ');
  $('rPrompt').textContent = r.prompt || '받은 일 기록이 없어요.';
  $('rMsgTitle').textContent = r.kind === 'attention' ? '지금 상태' : '보고';
  $('rMessage').textContent =
    r.kind === 'attention'
      ? `답이나 허락을 기다리고 있어요. ${r.app || '앱'}에서 확인해 주세요.${r.message ? `\n\n마지막으로 한 말: ${r.message}` : ''}`
      : r.message || '보고 내용이 없어요.';
  $('rNote').textContent =
    r.app === 'Orca' && (r.message || '').length >= 195 ? 'Orca가 마지막 답변의 앞부분만 알려 줘서 여기까지 보여요. 전체는 Orca에서 확인해요.' : '';
  $('rFolder').hidden = !r.path;
  $('rOrca').textContent = r.canSession ? '세션 열기' : `${r.app || '앱'} 열기`;
  $('rOrca').title = r.canSession ? `${r.app}에서 이 세션을 바로 열어요` : '';
  $('rOrca').hidden = !r.app || r.demo;
  $('rSeen').hidden = !!r.seen;
  $('report').hidden = false;
  UI.openLayer('report', closeReport);
  if (!r.read) {
    r.read = true;
    api('/api/read', { id: r.id }).then(refresh);
    renderInbox();
  }
}
function closeReport() {
  $('report').hidden = true;
  UI.closeLayer('report');
  openReportId = null;
}
const currentReport = () => (lastState.reports || []).find((r) => r.id === openReportId);
$('rClose').onclick = closeReport;
$('rOk').onclick = closeReport;
$('rSeen').onclick = () => {
  const id = openReportId;
  closeReport();
  if (id) setSeen([id], true);
};
$('rOrca').onclick = () => {
  const r = currentReport();
  if (r?.app) api('/api/open-app', { app: r.app, id: r.agentId });
};
$('rFolder').onclick = () => {
  const r = currentReport();
  if (r?.path) api('/api/open-folder', { path: r.path });
};
$('inboxList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const act = e.target.closest('[data-act]');
  if (act) return setSeen([li.dataset.id], act.dataset.act === 'seen');
  const r = (lastState.reports || []).find((x) => x.id === li.dataset.id);
  if (r) openReport(r);
});
// 봤어요: 지우지 않고 목록에서만 뺀다 ('본 것' 탭에서 다시 보거나 되돌릴 수 있다)
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
for (const b of document.querySelectorAll('.itabs button'))
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('.itabs button')) x.setAttribute('aria-selected', String(x === b));
    if (b.dataset.f === 'staff') return setInboxView('staff'); // 직원 명부
    inboxFilter = b.dataset.f;
    setInboxView('reports');
    renderInbox();
  });
// 모두 읽음: 지금 목록에 있는 보고를 모두 봤어요 처리해서 깔끔하게 비운다
$('readAll').onclick = () => {
  const ids = (lastState.reports || []).filter((r) => !r.seen).map((r) => r.id);
  if (ids.length) setSeen(ids, true, true);
};
$('demoBtn').onclick = () =>
  api('/api/demo', {}).then(() => UI.toast('🧪 연습 에이전트가 출근했어요', '13초쯤 일하다가 나한테 보고하러 와요.', 3200));
const setInbox = (open) => {
  $('inbox').classList.toggle('collapsed', !open);
  $('inboxShow').hidden = open;
};
// 상단바에서 펼친 작은 창: 보고함은 한 줄로 접어 두고 누르면 펼친다 (창 높이는 main.js가 맞춘다)
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

// 보고함: 화면의 다른 곳을 누르면 닫는다 (큰 창은 옆 패널을 접고, 작은 창은 한 줄로 접는다)
// 보고 자세히, 캐릭터 카드, 쉬는 에이전트 목록, 꾸미기, 작은 창 머리줄을 누를 때는 그대로 둔다
const KEEP_INBOX = '#inbox, #inboxShow, .modal, #card, #restPanel, #musicPanel, #avPanel, #avPreview, #miniHead';
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest(KEEP_INBOX)) return;
  if (MINI) {
    if (miniInboxOpen) setMiniInbox(false, true);
  } else if (!$('inbox').classList.contains('collapsed')) setInbox(false);
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
      on ? '📌 작은 창을 고정했어요' : '고정을 풀었어요',
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
  for (const id of ['hideBtn', 'mHide']) {
    $(id).setAttribute('aria-pressed', String(on));
    $(id).title = on ? '쉬는 에이전트 보이기' : '쉬는 에이전트 숨기기';
  }
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
$('mHide').onclick = (e) => (e.stopPropagation(), toggleRest());
$('mapSel').value = MAP_ID;
$('mapSel').onchange = (e) => api('/api/settings', { map: e.target.value }).then(() => location.reload());
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
const cam = { yaw: -PI / 4, yawT: -PI / 4, pitch: MINI ? 1.02 : 0.95, dist: MINI ? 20 : 18, distT: MINI ? 20 : 18, tx: W / 2 - 0.6, tz: D / 2 };
function updateCamera(dt) {
  cam.yaw = angleDamp(cam.yaw, cam.yawT, 9, dt);
  cam.dist = damp(cam.dist, cam.distT, 9, dt);
  const mx = MINI ? 4.5 : 3;
  cam.tx = damp(cam.tx, clamp(me.x, mx, W - mx), 3, dt);
  cam.tz = damp(cam.tz, clamp(me.z, mx - 0.5, D - mx + 0.5), 3, dt);
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
    if (!UI.closeTop() && fpv.on) toggleView(false);
    return;
  }
  if (UI.blocking()) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  keys.add(e.code);
  if (e.repeat) return;
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
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
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
function showCard(hit, x, y) {
  const card = $('card');
  let btns;
  const cl = card.querySelector('.cloyal');
  const sf = hit.boss ? null : staffOfAgent(hit.agent.data);
  cl.hidden = !sf;
  if (sf) {
    const next = RANK_AT[sf.rank + 1];
    cl.innerHTML = `<div class="lrow"><span class="rk r${sf.rank}">${RANK_NAMES[sf.rank]}</span><b>충성도 ${sf.pts}</b><small>${next != null ? `${RANK_NAMES[sf.rank + 1]}까지 ${next - sf.pts}점` : '최고 직급이에요'}</small></div><div class="lgauge"><i style="width:${sf.pts}%"></i></div>${
      sf.last ? `<small class="llast">최근: ${esc(sf.last.why)} ${sf.last.delta > 0 ? '+' : ''}${sf.last.delta}</small>` : ''
    }`;
  }
  // 이름 칸: 나는 내 이름, 에이전트는 내가 붙여 줄 이름 (비우면 원래 작업 이름)
  card.querySelector('.cname').hidden = true;
  $('cardName').hidden = false;
  $('cardName').maxLength = hit.boss ? 16 : 20;
  $('cardName').placeholder = hit.boss ? '나' : hit.agent.data.name || '에이전트';
  $('cardName').setAttribute('aria-label', hit.boss ? '내 이름' : '에이전트 이름');
  if (hit.boss) {
    cardAgent = null;
    const n = [...agents.values()].filter((a) => ACTIVE.has(a.data.state)).length;
    $('cardName').value = me.lbl.nm.textContent || '나';
    card.querySelector('.cstat').textContent = n ? `에이전트 ${n}명이 일하는 중이에요` : '지금은 다들 쉬는 중이에요';
    card.querySelector('.cbody').textContent = '이름은 위 칸에서 바로 바꿀 수 있어요. 방향키로 걷고, F로 앉고, G로 종이 총을 꺼내요.';
    card.querySelector('.cdot').style.background = bossLook.cloth;
    btns = `<button type="button" class="btn" data-c="look">${ico('face')}꾸미기</button>`;
  } else {
    const a = hit.agent;
    cardAgent = a;
    const d = a.data;
    $('cardName').value = nameOf(d);
    card.querySelector('.cstat').textContent = [statusText(d, a.role), d.app || typeLabel(d.type), d.worktree?.repo].filter(Boolean).join(' · ');
    const lines = [];
    if (nickOf(d.id)) lines.push(`작업: ${d.name}`);
    if (d.prompt) lines.push(`받은 일: ${short(clean(d.prompt), 120)}`);
    if (d.state === 'working' && d.toolHint) lines.push(`지금: ${d.toolHint}`);
    if (d.message && !ACTIVE.has(d.state)) lines.push(`마지막 말: ${short(clean(d.message), 140)}`);
    card.querySelector('.cbody').textContent = lines.join('\n');
    card.querySelector('.cdot').style.background = a.av.look.cloth;
    const hasReport = (lastState.reports || []).some((r) => r.agentId === a.id);
    btns = `${hasReport ? '<button type="button" class="btn ghost" data-c="report">보고 보기</button>' : ''}${
      d.app && !d.demo ? `<button type="button" class="btn" data-c="app">${d.canSession ? '세션 열기' : `${esc(d.app)} 열기`}</button>` : ''
    }${a.role === 'rest' ? `<button type="button" class="btn ghost" data-c="home">${ico('home')}퇴근시키기</button>` : ''}`;
  }
  card.querySelector('.cbtns').innerHTML = btns;
  card.style.left = clamp(x + 14, 8, innerWidth - 296) + 'px';
  card.style.top = clamp(y - 30, 8, innerHeight - 220) + 'px';
  card.hidden = false;
  UI.openLayer('card', hideCard, false);
}
function hideCard() {
  if (!$('cardName').hidden) (cardAgent ? saveAgentName(cardAgent, $('cardName').value) : saveBossName($('cardName').value));
  $('card').hidden = true;
  UI.closeLayer('card');
}
$('cardClose').onclick = hideCard;
$('card').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (!c) return;
  const a = cardAgent;
  hideCard();
  if (c === 'look') openLook();
  else if (c === 'home' && a) sendHome(a);
  else if (c === 'app' && a?.data.app) api('/api/open-app', { app: a.data.app, id: a.id });
  else if (c === 'report' && a) {
    const r = (lastState.reports || []).find((x) => x.agentId === a.id);
    if (r) openReport(r);
  }
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

addEventListener('resize', () => {
  VB = viewBox();
  renderer.setSize(VB.w, VB.h);
  camera.aspect = VB.w / VB.h;
  camera.updateProjectionMatrix();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b && e.detail > 0) b.blur();
});
setTimeout(() => {
  $('hint').style.opacity = '0';
  $('miniHint').style.opacity = '0';
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
    place(a.lbl, _a.x, _a.y, _a.z);
    setText(a.lbl.nm, 'nmText', a.lbl, short(nameOf(a.data), 18));
    setText(a.lbl.sub, 'subText', a.lbl, statusText(a.data, a.role));
    const attn = ATTN.has(a.data.state) && a.role !== 'report';
    if (a.lbl.attn !== attn) {
      a.lbl.attn = attn;
      a.lbl.sub.classList.toggle('attn', attn);
    }
    if (a.lbl.bubUntil && now > a.lbl.bubUntil) {
      a.lbl.bub.hidden = true;
      a.lbl.bubUntil = 0;
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
  [...agents.values()].some((a) => a.mode === 'walk' || a.role === 'report');
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
    UI.toast(`🎉 ${pr.name}`, `${ro(pr.title)} 승진했어요!`, 3800);
    const a = [...agents.values()].find((x) => x.data.staffKey === pr.key);
    const x = a ? a.x : me.x;
    const z = a ? a.z : me.z;
    for (let i = 0; i < 4; i++) setTimeout(() => fx.burst(x + (Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 0.6, z + (Math.random() - 0.5) * 1.2, 40), i * 260);
    chime();
  }
}
let inboxView = 'reports';
let staffSig = '';
function setInboxView(v) {
  inboxView = v;
  document.body.classList.toggle('staffv', v === 'staff');
  $('staffView').hidden = v !== 'staff';
  $('inboxList').hidden = v === 'staff';
  staffSig = '';
  renderStaff();
}
function renderStaff() {
  if (inboxView !== 'staff') return;
  const list = Object.entries(lastState.staff || {}).sort((p, q) => q[1].pts - p[1].pts);
  const sig = JSON.stringify(list.map(([k, v]) => [k, v.pts, v.today]));
  if (sig === staffSig) return;
  staffSig = sig;
  const mvp = list.filter(([, v]) => v.today > 0).sort((p, q) => q[1].today - p[1].today)[0];
  $('mvp').innerHTML = `<span class="mvpic">🏆</span><span><small>오늘의 MVP</small><b>${mvp ? esc(mvp[1].name) : '아직 없어요'}</b><em>${
    mvp ? `오늘 +${mvp[1].today}점` : '보고를 빨리 읽어 주면 점수가 올라요'
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
  for (const id of ['hideBtn', 'mHide']) $(id).setAttribute('aria-expanded', String(restOpen));
  if (restOpen) {
    const b = $(MINI ? 'mHide' : 'hideBtn').getBoundingClientRect();
    const P = $('restPanel');
    P.style.top = `${Math.round(b.bottom + 8)}px`;
    P.style.right = MINI ? '10px' : `${Math.max(10, Math.round(innerWidth - b.right))}px`;
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
  $('mHide').classList.toggle('has', n > 0);
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
  if (ids.length) UI.toast(`🏠 ${ids.length}명 퇴근했어요`, '새 일을 받으면 다시 출근해요.', 2400);
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
  if (restOpen && !e.target.closest('#restPanel, #hideBtn, #mHide')) toggleRest(false);
  if (musicPanelOpen && !e.target.closest('#musicPanel, #musicBtn')) toggleMusicPanel(false);
});

// ---------- 음악: '음악' 버튼 아래 작은 팝업. 영상 칸 위에 YouTube 페이지가 겹쳐 뜬다 ----------
// (YouTube 칸은 main.js가 따로 띄운다. 이 칸만 YouTube에 접속하고, 접어도 소리는 계속 난다)
let musicPanelOpen = false;
let musicOn = false;
function placeMusicPanel() {
  const b = $('musicBtn').getBoundingClientRect();
  const P = $('musicPanel');
  P.style.top = `${Math.round(b.bottom + 8)}px`;
  P.style.right = `${Math.max(10, Math.round(innerWidth - b.right))}px`;
}
function placeMusicView() {
  if (!musicPanelOpen || !musicOn) return;
  const r = $('musicStage').getBoundingClientRect();
  api('/api/music', { action: 'show', rect: { x: Math.max(0, r.left), y: Math.max(0, r.top), w: r.width, h: r.height } }).catch(() => {});
}
function toggleMusicPanel(force) {
  if (MINI) return api('/api/open-window', { music: true }); // 작은 창에서는 큰 창을 열어 보여 준다
  musicPanelOpen = force ?? !musicPanelOpen;
  $('musicPanel').hidden = !musicPanelOpen;
  $('musicBtn').setAttribute('aria-expanded', String(musicPanelOpen));
  if (!musicPanelOpen) {
    UI.closeLayer('music');
    if (musicOn) api('/api/music', { action: 'hide' }).catch(() => {});
    return;
  }
  placeMusicPanel();
  if (!$('musicUrl').value) $('musicUrl').value = lastState.settings?.musicUrl || '';
  $('musicErr').hidden = true;
  UI.openLayer('music', () => toggleMusicPanel(false), false);
  requestAnimationFrame(placeMusicView);
  if (!musicOn) setTimeout(() => $('musicUrl').focus(), 60);
}
function showMusicState(m) {
  const on = !!m?.on;
  const turnedOn = on && !musicOn;
  musicOn = on;
  $('musicBtn').setAttribute('aria-pressed', String(on));
  $('musicState').textContent = on ? m.title || '재생 중' : '';
  $('musicState').title = on ? m.title || '' : '';
  $('musicStop').disabled = !on;
  $('musicStage').classList.toggle('on', on);
  if (turnedOn) placeMusicView();
}
$('musicBtn').onclick = () => toggleMusicPanel();
$('musicClose').onclick = () => toggleMusicPanel(false);
$('musicForm').onsubmit = async (e) => {
  e.preventDefault();
  const r = await api('/api/music', { action: 'play', url: $('musicUrl').value }).catch(() => null);
  if (!r?.ok) {
    $('musicErr').hidden = false;
    return;
  }
  $('musicErr').hidden = true;
  showMusicState({ on: true, title: '' });
  placeMusicView();
};
$('musicStop').onclick = () =>
  api('/api/music', { action: 'stop' }).then(() => {
    showMusicState({ on: false });
  });
addEventListener('resize', () => {
  if (!musicPanelOpen) return;
  placeMusicPanel();
  placeMusicView();
});
window.openMusicFromMain = () => toggleMusicPanel(true); // 상단바 메뉴의 '음악 틀기…', '음악 보기'
if (!MINI && q.get('open') === 'music') setTimeout(() => toggleMusicPanel(true), 500);

// 점검용: 주소에 debug=1이 있을 때만 내부 상태를 꺼내 본다 (자동 점검 스크립트에서 쓴다)
if (q.get('debug') === '1') window.__ao = { agents, me, used, NEAR_BOSS, rank: rankOfAgent, state: () => lastState, showCard, hideCard };

if (boot && Array.isArray(boot.agents) && boot.at) sync(boot);
setInterval(refresh, 1000);
setInterval(() => {
  renderInbox();
  drawStatus(lastState);
}, 30000);
