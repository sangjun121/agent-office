// 에이전트 작업실: Orca, Claude, Codex에서 돌린 에이전트를 3D 캐릭터로 보여 주고,
// 일이 끝나면 내 캐릭터 옆으로 걸어와서 보고하게 한다. 나는 방향키로 돌아다닐 수 있다.
import * as THREE from 'three';
import { buildRoom } from '/js/room.js';
import { buildCafe } from '/js/cafe.js';
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
const MAP_ID = settings.map === 'cafe' ? 'cafe' : 'office';

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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(VB.w, VB.h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
  el.innerHTML = `<div class="bub" hidden></div><div class="tag ${kind}"><span class="ico"></span><span class="nm"></span></div><div class="sub"></div>`;
  $('labels').appendChild(el);
  return { el, bub: el.querySelector('.bub'), ico: el.querySelector('.ico'), nm: el.querySelector('.nm'), sub: el.querySelector('.sub'), vis: null, bubUntil: 0 };
}
function place(lbl, x, y, z) {
  _v.set(x, y, z).project(camera);
  const vis = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15;
  if (vis) lbl.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * VB.w}px, ${(-_v.y * 0.5 + 0.5) * VB.h}px) translate(-50%, -100%)`;
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
  av: new Avatar(bossLook),
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
  if (name === 'heart') popEmoji(me.lbl, '💗', 5);
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
      best = { kind: 'agent', agent: a, label: `${short(a.data.name, 12)} 보기` };
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
  const av = new Avatar(lookFor(d.id));
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
  let budget = 2.3 * dt;
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
  const k = claim(WORK_KEYS, a.id, hashStr(a.id) % WORK_KEYS.length);
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
function toLounge(a, instant) {
  if (settings.hideResting) return leave(a, instant);
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
  a.emote = 'wave';
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
  UI.toast(`${r.kind === 'interrupted' ? '⏸' : '✅'} ${r.name}`, '보고하러 가는 중이에요', 2600);
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
  if (s.map && s.map !== MAP_ID) return location.reload(); // 맵이 바뀌면 새로 그린다
  const name = s.bossName || '나';
  if (me.lbl.nm.textContent !== name) me.lbl.nm.textContent = name;
  if (typeof s.sound === 'boolean' && s.sound !== soundOn && Date.now() - soundTouched > 3000) setSound(s.sound, false);
  if (typeof s.hideResting === 'boolean' && s.hideResting !== settings.hideResting && Date.now() - hideTouched > 3000) setHide(s.hideResting, false);
  Object.assign(settings, s);
}

function sync(st) {
  lastState = st;
  applySettings(st.settings);
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
      if (!busy && settings.hideResting && !reporting.has(d.id)) continue;
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
      UI.toast(`❗ ${r.name}`, '확인이 필요해요. 자리에서 손을 들고 있어요.', 3500);
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
    else if (!busy && (a.role !== 'rest' || settings.hideResting)) toLounge(a, first);
  }
  synced = true;
  renderHud(st);
  renderInbox();
  drawStatus(st);
}

async function refresh() {
  try {
    const st = await api('/api/state');
    if (!st || !Array.isArray(st.agents)) return;
    if (!st.at) return; // 서버가 아직 한 번도 못 읽었다
    sync(st);
  } catch {
    $('conn').textContent = '작업실 서버와 연결이 끊겼어요';
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
  conn.textContent = names.length ? `보는 중: ${names.join(' · ')}` : '볼 수 있는 앱이 없어요';
  conn.title = st.error ? `Orca: ${st.error}` : '';
  conn.classList.toggle('off', !names.length);
  const u = st.unread || 0;
  $('unreadCnt').textContent = u || '';
  $('unreadCnt2').textContent = u || '';
  document.title = u ? `(${u}) 에이전트 작업실` : '에이전트 작업실';
}

let inboxFilter = 'all';
let inboxSig = '';
function renderInbox() {
  const all = lastState.reports || [];
  const list = all.filter((r) => inboxFilter === 'all' || (inboxFilter === 'unread' ? !r.read : r.kind === 'attention'));
  const sig = JSON.stringify([inboxFilter, list.map((r) => [r.id, r.read]), Math.floor(Date.now() / 60000)]);
  if (sig === inboxSig) return;
  inboxSig = sig;
  if (!list.length) {
    $('inboxList').innerHTML = `<li class="empty">${
      inboxFilter === 'all' ? '에이전트가 일을 끝낼 때마다<br>여기에 보고가 쌓여요.<br>🧪 연습을 눌러 미리 볼 수도 있어요.' : '여기는 비어 있어요.'
    }</li>`;
    return;
  }
  $('inboxList').innerHTML = list
    .map((r) => {
      const ic = r.kind === 'attention' ? '❗' : r.kind === 'interrupted' ? '⏸' : '✅';
      const where = [r.app, r.repo, r.branch].filter(Boolean).join(' · ');
      const text = r.kind === 'attention' ? '답이나 허락을 기다리고 있어요' : clean(r.message) || '보고 내용이 없어요';
      return `<li class="k-${r.kind}${r.read ? '' : ' unread'}" data-id="${esc(r.id)}"><span class="ic">${ic}</span><b>${esc(r.name)}</b><small>${esc(where)}${where ? ' · ' : ''}${ago(r.at)}</small><p>${esc(text)}</p></li>`;
    })
    .join('');
}

let statusSig = '';
function drawStatus(st) {
  const ags = st.agents || [];
  const info = {
    work: ags.filter((d) => ACTIVE.has(d.state)).map((d) => ({ name: d.name, sub: [d.app, statusText(d).replace(/^\S+\s/, '')].filter(Boolean).join(' · ') })),
    attn: ags.filter((d) => ATTN.has(d.state)).map((d) => ({ name: d.name, sub: d.state === 'blocked' ? '허락이 필요해요' : '답을 기다려요' })),
    done: (st.reports || [])
      .filter((r) => r.kind !== 'attention' && r.at >= startOfToday())
      .map((r) => ({ name: r.name, sub: [fmtTime(r.at), r.app, r.repo].filter(Boolean).join(' · ') })),
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
  icon.textContent = r.kind === 'attention' ? '❗' : r.kind === 'interrupted' ? '⏸' : '✅';
  icon.className = `ricon k-${r.kind}`;
  $('rTitle').textContent = r.name;
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
  $('rOrca').textContent = `${r.app || '앱'} 열기`;
  $('rOrca').hidden = !r.app || r.demo;
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
$('rOrca').onclick = () => {
  const r = currentReport();
  if (r?.app) api('/api/open-app', { app: r.app });
};
$('rFolder').onclick = () => {
  const r = currentReport();
  if (r?.path) api('/api/open-folder', { path: r.path });
};
$('inboxList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  const r = li && (lastState.reports || []).find((x) => x.id === li.dataset.id);
  if (r) openReport(r);
});
for (const b of document.querySelectorAll('.itabs button'))
  b.addEventListener('click', () => {
    inboxFilter = b.dataset.f;
    for (const x of document.querySelectorAll('.itabs button')) x.setAttribute('aria-selected', String(x === b));
    renderInbox();
  });
$('readAll').onclick = () => api('/api/read', { all: true }).then(refresh);
$('demoBtn').onclick = () =>
  api('/api/demo', {}).then(() => UI.toast('🧪 연습 에이전트가 출근했어요', '13초쯤 일하다가 나한테 보고하러 와요.', 3200));
const setInbox = (open) => {
  $('inbox').classList.toggle('collapsed', !open);
  $('inboxShow').hidden = open;
};
$('inboxHide').onclick = () => setInbox(false);
$('inboxShow').onclick = () => setInbox(true);

// ---------- 소리, 숨기기, 맵 ----------
let soundOn = settings.sound !== false;
let soundTouched = 0;
function setSound(on, save) {
  soundOn = on;
  $('soundBtn').setAttribute('aria-pressed', String(on));
  $('soundBtn').textContent = on ? '🔔' : '🔕';
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
  $('hideBtn').textContent = on ? '💤 쉬는 에이전트 숨김' : '💤 쉬는 에이전트 보기';
  if (on) for (const a of [...agents.values()]) if (a.role === 'rest') leave(a);
  if (save) {
    hideTouched = Date.now();
    api('/api/settings', { hideResting: on }).then(refresh);
    UI.toast(on ? '쉬는 에이전트를 숨겼어요' : '쉬는 에이전트도 보여요', on ? '일 끝난 에이전트는 보고하고 퇴근해요.' : '일 끝난 에이전트는 라운지에서 쉬어요.', 2000);
  }
}
setHide(!!settings.hideResting, false);
$('hideBtn').onclick = () => setHide(!settings.hideResting, true);
$('mHide').onclick = () => setHide(!settings.hideResting, true);
$('mapSel').value = MAP_ID;
$('mapSel').onchange = (e) => api('/api/settings', { map: e.target.value }).then(() => location.reload());
$('setupBtn').onclick = () => api('/api/open-setup', { step: 2 });
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
  camera.lookAt(cam.tx, 0.3, cam.tz);
  room.setCut(Math.sin(cam.yaw), Math.cos(cam.yaw), true);
}
$('rotL').onclick = () => (cam.yawT += PI / 4);
$('rotR').onclick = () => (cam.yawT -= PI / 4);

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
    UI.closeTop();
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
  if (f || r) {
    let mx = -Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * r;
    let mz = -Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * r;
    const l = Math.hypot(mx, mz) || 1;
    mx /= l;
    mz /= l;
    if (me.st) meStand();
    if (me.act === 'dance' || me.act === 'laptop') me.act = '';
    const sp = run ? 5.0 : 2.8;
    [me.x, me.z] = collide(me.x + mx * sp * dt, me.z + mz * sp * dt);
    me.moving = run ? 2 : 1;
    me.h = angleDamp(me.h, Math.atan2(mx, mz), 14, dt);
  } else me.moving = 0;
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
  const targets = [me.av.hitbox, ...[...agents.values()].map((a) => a.av.hitbox)];
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
    cam.distT = clamp(cam.distT + e.deltaY * 0.012, 7, 30);
  },
  { passive: false },
);

let cardAgent = null;
function showCard(hit, x, y) {
  const card = $('card');
  let btns;
  if (hit.boss) {
    cardAgent = null;
    const n = [...agents.values()].filter((a) => ACTIVE.has(a.data.state)).length;
    card.querySelector('.cname').textContent = me.lbl.nm.textContent || '나';
    card.querySelector('.cstat').textContent = n ? `에이전트 ${n}명이 일하는 중이에요` : '지금은 다들 쉬는 중이에요';
    card.querySelector('.cbody').textContent = '방향키로 걷고, F로 앉고, G로 종이 총을 꺼내요.';
    card.querySelector('.cdot').style.background = bossLook.cloth;
    btns = `<button type="button" class="btn" data-c="look">🎨 꾸미기</button>`;
  } else {
    const a = hit.agent;
    cardAgent = a;
    const d = a.data;
    card.querySelector('.cname').textContent = d.name;
    card.querySelector('.cstat').textContent = [statusText(d, a.role), d.app || typeLabel(d.type), d.worktree?.repo].filter(Boolean).join(' · ');
    const lines = [];
    if (d.prompt) lines.push(`받은 일: ${short(clean(d.prompt), 120)}`);
    if (d.state === 'working' && d.toolHint) lines.push(`지금: ${d.toolHint}`);
    if (d.message && !ACTIVE.has(d.state)) lines.push(`마지막 말: ${short(clean(d.message), 140)}`);
    card.querySelector('.cbody').textContent = lines.join('\n');
    card.querySelector('.cdot').style.background = a.av.look.cloth;
    const hasReport = (lastState.reports || []).some((r) => r.agentId === a.id);
    btns = `${hasReport ? '<button type="button" class="btn ghost" data-c="report">보고 보기</button>' : ''}${
      d.app && !d.demo ? `<button type="button" class="btn" data-c="app">${esc(d.app)} 열기</button>` : ''
    }`;
  }
  card.querySelector('.cbtns').innerHTML = btns;
  card.style.left = clamp(x + 14, 8, innerWidth - 296) + 'px';
  card.style.top = clamp(y - 30, 8, innerHeight - 220) + 'px';
  card.hidden = false;
  UI.openLayer('card', hideCard, false);
}
function hideCard() {
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
  else if (c === 'app' && a?.data.app) api('/api/open-app', { app: a.data.app });
  else if (c === 'report' && a) {
    const r = (lastState.reports || []).find((x) => x.agentId === a.id);
    if (r) openReport(r);
  }
});
const openLook = () =>
  openEditor(bossLook, (l) => {
    bossLook = normalizeLook(l);
    me.av.setLook(bossLook);
    api('/api/settings', { bossLook });
  });
$('lookBtn').onclick = openLook;

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
    setText(a.lbl.nm, 'nmText', a.lbl, short(a.data.name || '에이전트', 18));
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
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  updateMe(dt);
  for (const a of agents.values()) {
    if (a.mode === 'walk') stepWalk(a, dt);
    a.moving = a.mode === 'walk' ? 1 : 0;
    const s = a.data.state;
    a.act = a.role === 'work' && a.st === 1 && s === 'working' ? 'laptop' : '';
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
renderer.render(scene, camera);
requestAnimationFrame(frame);
setTimeout(() => $('loading').classList.add('done'), 150);
if (boot && Array.isArray(boot.agents) && boot.at) sync(boot);
setInterval(refresh, 1000);
setInterval(() => {
  renderInbox();
  drawStatus(lastState);
}, 30000);
