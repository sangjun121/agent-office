export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// 프레임 속도와 상관없이 부드럽게 따라가기
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
export const angleDamp = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('nshop.' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('nshop.' + k, JSON.stringify(v));
    } catch {}
  },
};

export const isTouch = matchMedia('(pointer: coarse)').matches;

export function hashStr(s) {
  let h = 7;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h);
}

export const uid = () =>
  (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 36);

// 받침에 따라 조사 고르기: particle('클린 코드', '을', '를') → '를'
export function particle(word, withBatchim, without) {
  const s = String(word).replace(/[\s)\]』」~.!?]+$/u, '');
  const c = s.charCodeAt(s.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? withBatchim : without;
  return `${withBatchim}(${without})`;
}

export const fmtTime = (at) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
