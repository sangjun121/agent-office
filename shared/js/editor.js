// 캐릭터 꾸미기 창 + 빙글빙글 도는 미리보기
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { LOOK_PARTS, COLOR_PARTS, normalizeLook, randomLook, bamtiLook } from './config.js';
import { $, esc } from './util.js';
import * as UI from './ui.js';

const ORDER = ['skin', 'hair', 'hairColor', 'hat', 'face', 'glasses', 'top', 'cloth', 'neck', 'bag', 'accent'];

let preview = null;
function getPreview() {
  if (preview) return preview;
  const cv = $('avCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(240, 280, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFF8EE', '#9C8B7A', 2.2));
  scene.add(new THREE.AmbientLight('#FFFFFF', 0.5));
  const dl = new THREE.DirectionalLight('#FFF1DE', 2.0);
  dl.position.set(2, 4, 3);
  scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 240 / 280, 0.1, 20);
  cam.position.set(0, 0.9, 3.1);
  cam.lookAt(0, 0.6, 0);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 40), new THREE.MeshStandardMaterial({ color: '#E9E1D2', roughness: 0.9 }));
  disc.position.y = -0.025;
  scene.add(disc);
  preview = { renderer, scene, cam, cv };
  return preview;
}

let state = null;

export function openEditor(look, onChange) {
  if (state) return;
  const L = { ...normalizeLook(look) };
  const pv = getPreview();
  const av = new Avatar(L, { shadow: false });
  pv.scene.add(av.root);

  let rotY = 0.4;
  let drag = null;
  let raf = 0;
  let t = 0;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (!drag) rotY += dt * 0.45;
    av.root.rotation.y = rotY;
    const k = t % 6;
    av.update(dt, { t, moving: 0, st: 0, act: '', emote: k < 1.7 ? 'wave' : '', emoteT: k });
    pv.renderer.render(pv.scene, pv.cam);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  pv.cv.onpointerdown = (e) => {
    drag = { x: e.clientX };
    pv.cv.setPointerCapture(e.pointerId);
  };
  pv.cv.onpointermove = (e) => {
    if (!drag) return;
    rotY += (e.clientX - drag.x) * 0.012;
    drag.x = e.clientX;
  };
  pv.cv.onpointerup = pv.cv.onpointercancel = () => (drag = null);

  // 칸 그리기 (한 번만), 이후엔 눌림 표시만 바꾼다
  const body = $('avBody');
  body.innerHTML = ORDER.map((k) => {
    if (LOOK_PARTS[k]) {
      const part = LOOK_PARTS[k];
      return `<div class="avrow"><b>${esc(part.label)}</b><div class="avopts">${Object.entries(part.options)
        .map(([v, label]) => `<button type="button" data-k="${k}" data-v="${v}">${esc(label)}</button>`)
        .join('')}</div></div>`;
    }
    const part = COLOR_PARTS[k];
    return `<div class="avrow"><b>${esc(part.label)}</b><div class="swatches">${part.palette
      .map(([name, c]) => `<button type="button" data-k="${k}" data-v="${c}" title="${esc(name)}" aria-label="${esc(name)}" style="background:${c}"></button>`)
      .join('')}<label>직접<input type="color" data-k="${k}"></label></div></div>`;
  }).join('');

  const sync = () => {
    for (const b of body.querySelectorAll('button[data-k]')) b.setAttribute('aria-pressed', String(L[b.dataset.k] === b.dataset.v));
    for (const inp of body.querySelectorAll('input[type=color]')) inp.value = L[inp.dataset.k].toLowerCase();
  };
  const apply = () => {
    av.setLook(L);
    onChange({ ...L });
    sync();
  };
  body.onclick = (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    L[b.dataset.k] = b.dataset.v;
    apply();
  };
  body.oninput = (e) => {
    const inp = e.target.closest('input[type=color]');
    if (!inp) return;
    L[inp.dataset.k] = inp.value.toUpperCase();
    apply();
  };
  $('avRandom').onclick = () => {
    Object.assign(L, randomLook());
    apply();
  };
  if ($('avBamti'))
    $('avBamti').onclick = () => {
      Object.assign(L, bamtiLook());
      apply();
    };
  sync();

  const close = () => {
    cancelAnimationFrame(raf);
    pv.scene.remove(av.root);
    av.dispose();
    $('avPanel').hidden = true;
    $('avPreview').hidden = true;
    UI.closeLayer('editor');
    state = null;
  };
  $('avDone').onclick = close;
  $('avPanel').hidden = false;
  $('avPreview').hidden = false;
  UI.openLayer('editor', close);
  state = { close };
}
