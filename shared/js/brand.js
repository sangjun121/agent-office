// 방에 붙는 글씨와 스티커 (문패, 시계, 포스터, 스티커)
import { FONT_HAND } from './tex.js';

export const OFFICE_BRAND = {
  mark: '✓', // 스티커, 시계, 문패에 들어가는 짧은 표시 ('✓'이면 체크 모양)
  plateSub: '에이전트 작업실',
  posterFoot: '— 오늘도 수고했어요 —',
  photoCaption: '팀 워크숍 단체 사진 📸',
  cork: 'office',
};

export const brand = { ...OFFICE_BRAND };

export function setBrand(b) {
  Object.assign(brand, b);
}

// 동그란 스티커: 주황 원 + 표시(글자 또는 체크)
export function drawMark(g, cx, cy, r, { bg = '#FF8A3D', fg = '#FFFFFF' } = {}) {
  g.save();
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  if (brand.mark === '✓') {
    g.strokeStyle = fg;
    g.lineWidth = r * 0.28;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx - r * 0.45, cy + r * 0.02);
    g.lineTo(cx - r * 0.1, cy + r * 0.36);
    g.lineTo(cx + r * 0.5, cy - r * 0.34);
    g.stroke();
  } else {
    g.fillStyle = fg;
    g.font = `bold ${Math.round(r * 0.72)}px ${FONT_HAND}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(brand.mark, cx, cy + r * 0.06);
  }
  g.restore();
}
