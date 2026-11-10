// 캐릭터 얼굴 그림: 보고함, 캐릭터 카드, 대화 창의 동그라미에 쓴다.
// 방 안의 캐릭터와 같은 모습(머리, 표정, 모자, 옷 색)을 작은 그림 한 장으로 찍어 두고 다시 쓴다.
import * as THREE from 'three';
import { Avatar } from './avatar.js';

const SIZE = 112; // 찍는 크기 (화면에서는 28~40px로 줄여 쓴다)
let kit = null;
const cache = new Map(); // 모습 → 그림 주소 (blob:)
const MAX = 150; // 이보다 많아지면 오래된 그림부터 버린다 (오래 켜 둬도 메모리가 늘지 않게)
const _p = new THREE.Vector3();

function getKit() {
  if (kit) return kit;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFF8EE', '#9C8B7A', 2.2));
  scene.add(new THREE.AmbientLight('#FFFFFF', 0.5));
  const dl = new THREE.DirectionalLight('#FFF1DE', 2.0);
  dl.position.set(2, 4, 3);
  scene.add(dl);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  kit = { renderer, scene, cam };
  return kit;
}

// 모습(look)을 주면 얼굴 그림 주소를 돌려준다. 못 그리면 빈 글자 (그때는 옷 색 동그라미만 보인다)
export function faceURL(look) {
  const key = JSON.stringify(look || {});
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    const { renderer, scene, cam } = getKit();
    const av = new Avatar(look, { shadow: false });
    av.root.rotation.y = 0.32;
    scene.add(av.root);
    av.update(0.016, { t: 0, moving: 0, st: 0, act: '', emote: '', emoteT: 9 });
    av.root.updateMatrixWorld(true);
    av.head.getWorldPosition(_p);
    cam.position.set(_p.x + 0.25, _p.y + 0.14, _p.z + 2.15);
    cam.lookAt(_p.x, _p.y + 0.03, _p.z);
    renderer.render(scene, cam);
    const data = renderer.domElement.toDataURL('image/png');
    scene.remove(av.root);
    av.dispose();
    // 긴 data: 주소를 목록마다 넣지 않게 짧은 blob: 주소로 바꿔 둔다
    const bin = atob(data.slice(data.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } catch {
    url = '';
  }
  cache.set(key, url);
  if (cache.size > MAX) {
    const [old, oldUrl] = cache.entries().next().value;
    cache.delete(old);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }
  return url;
}
