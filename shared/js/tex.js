import * as THREE from 'three';

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.pixel) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  t.userData.canvas = c;
  t.userData.ctx = g;
  return t;
}

export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FONT_HAND = '"Jua", "Pretendard Variable", "Apple SD Gothic Neo", sans-serif';
export const FONT_BODY = '"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", sans-serif';

// 코드가 떠 있는 화면 (모니터, 노트북)
export function codeScreenTexture(seed = 1, w = 256, h = 160) {
  const R = rng(seed);
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#1E222A';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2A2F3A';
    g.fillRect(0, 0, w, h * 0.1);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = ['#FF6B5A', '#FFD15C', '#3FB37F'][i];
      g.beginPath();
      g.arc(10 + i * 12, h * 0.05, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    const colors = ['#C678DD', '#98C379', '#61AFEF', '#E5C07B', '#ABB2BF', '#E06C75', '#56B6C2'];
    const lh = h * 0.075;
    let indent = 0;
    for (let y = h * 0.16; y < h - lh; y += lh) {
      g.fillStyle = '#4B5263';
      g.fillRect(6, y, 8, lh * 0.45);
      let x = 22 + indent * 12;
      const n = 1 + Math.floor(R() * 4);
      for (let k = 0; k < n && x < w - 20; k++) {
        const ww = 10 + R() * 42;
        g.fillStyle = colors[Math.floor(R() * colors.length)];
        g.fillRect(x, y, ww, lh * 0.45);
        x += ww + 5;
      }
      const r = R();
      if (r < 0.25) indent = Math.min(3, indent + 1);
      else if (r < 0.45) indent = Math.max(0, indent - 1);
    }
  });
}
