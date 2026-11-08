// 토스트와 열린 창 관리 (Esc로 위에서부터 닫는다)
import { $, esc } from './util.js';

const layers = [];
let onBlockOpen = null;
export function setOnBlockOpen(fn) {
  onBlockOpen = fn;
}
export function openLayer(id, close, blocking = true) {
  if (!layers.some((l) => l.id === id)) layers.push({ id, close, blocking });
  if (blocking) onBlockOpen?.();
}
export function closeLayer(id) {
  const i = layers.findIndex((l) => l.id === id);
  if (i >= 0) layers.splice(i, 1);
}
export function closeTop() {
  const l = layers[layers.length - 1];
  if (!l) return false;
  l.close();
  closeLayer(l.id);
  return true;
}
export const blocking = () => layers.some((l) => l.blocking);
export const isOpen = (id) => layers.some((l) => l.id === id);

export function toast(title, text = '', ms = 2800) {
  const box = $('toasts');
  for (const el of [...box.children]) if (el.dataset.title === title) el.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.title = title;
  el.innerHTML = `<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}`;
  box.prepend(el);
  while (box.children.length > 3) box.lastElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}
