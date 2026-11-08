// 작업실 마스코트: 말풍선 친구 (보고하러 오는 말풍선이 그대로 캐릭터)
// 상단바 아이콘(검정 선화)과 앱 아이콘(색)을 같은 모양으로 그린다. 다른 시안은 TRAY와 DRAFTS에 남겨 둔다.
// 상단바 아이콘은 macOS 템플릿 이미지라 투명도만 쓴다 (검정 + 투명).
const wrap = (body, vb = '0 0 36 36') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

export const DEFAULT_TRAY = 'bubble'; // 말풍선 친구 (DRAFTS.bubble)

// ---------- 상단바 아이콘 (36칸) ----------
export const TRAY = {
  // 다른 시안: 노트북 너머로 빼꼼 (뚜껑에 체크)
  peek: wrap(`<defs>
<clipPath id="c"><circle cx="18" cy="14.6" r="10"/></clipPath>
<mask id="cut"><rect width="36" height="36" fill="#fff"/><rect x="2.4" y="18.9" width="31.2" height="17" rx="5" fill="#000"/></mask>
</defs>
<g mask="url(#cut)">
<circle cx="18" cy="14.6" r="10" fill="none" stroke="#000" stroke-width="2.4"/>
<path d="M5 2 H31 V15.8 Q18 4.4 5 15.8 Z" clip-path="url(#c)"/>
<ellipse cx="14" cy="16.6" rx="1.6" ry="2"/><ellipse cx="22" cy="16.6" rx="1.6" ry="2"/>
</g>
<rect x="5" y="21.3" width="26" height="12" rx="3.4" fill="none" stroke="#000" stroke-width="2.3"/>
<path d="M13.8 27.4 L16.7 30 L22.2 24.6" fill="none" stroke="#000" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`),

  // 다른 시안: 앞머리 + 더듬이 얼굴
  face: wrap(`<defs><clipPath id="c"><circle cx="18" cy="20" r="12.6"/></clipPath></defs>
<circle cx="18" cy="20" r="12.6" fill="none" stroke="#000" stroke-width="2.4"/>
<path d="M3.4 5.4 H32.6 V22.5 Q18 9 3.4 22.5 Z" clip-path="url(#c)"/>
<path d="M18.5 6.8 Q17.5 1.2 23.2 2" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"/>
<ellipse cx="13.2" cy="22.6" rx="1.75" ry="2.25"/><ellipse cx="22.8" cy="22.6" rx="1.75" ry="2.25"/>
<path d="M15.6 26.8 Q18 28.9 20.4 26.8" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round"/>`),

  // 다른 시안: 꼬마 로봇
  robot: wrap(`<rect x="6.8" y="11.2" width="22.4" height="19.6" rx="6.6" fill="none" stroke="#000" stroke-width="2.4"/>
<path d="M18 11.2 V6.6" stroke="#000" stroke-width="2.2" stroke-linecap="round"/>
<circle cx="18" cy="4.6" r="2.5"/>
<circle cx="13.6" cy="20" r="2.3"/><circle cx="22.4" cy="20" r="2.3"/>
<path d="M15 25.2 Q18 27.4 21 25.2" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round"/>
<rect x="3.2" y="17.2" width="2.8" height="7" rx="1.4"/><rect x="30" y="17.2" width="2.8" height="7" rx="1.4"/>`),

  // 다른 시안: 헤드폰
  phones: wrap(`<circle cx="18" cy="20.5" r="10.2" fill="none" stroke="#000" stroke-width="2.4"/>
<path d="M3.6 21 A14.4 14.4 0 0 1 32.4 21" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round"/>
<rect x="2" y="17" width="5.4" height="10" rx="2.6"/><rect x="28.6" y="17" width="5.4" height="10" rx="2.6"/>
<ellipse cx="14" cy="21.2" rx="1.6" ry="2.1"/><ellipse cx="22" cy="21.2" rx="1.6" ry="2.1"/>
<path d="M15.8 25.6 Q18 27.6 20.2 25.6" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/>`),
};

// ---------- 앱 아이콘 (1024, 색): 상단바 아이콘과 같은 캐릭터를 초록 바탕에 ----------
const SKIN = '#FFE6D2';
const HAIR = '#2B2422';
const INK = '#2A2320';
const CREAM = '#FFF6E8';
const ORANGE = '#FF8A3D';
const BLUSH = '#F6A6C1';
// 시안마다: 36칸 → 1024 배율(k), 36칸에서 그림 가운데로 볼 y(cy), 그리고 그림
const APP_ART = {
  face: {
    k: 19,
    cy: 17.5,
    draw: (X, Y, S) => {
      const head = `cx="${X(18)}" cy="${Y(20)}" r="${S(12.6)}"`;
      const tuft = `M${X(18.5)} ${Y(6.8)} Q${X(17.5)} ${Y(1.2)} ${X(23.2)} ${Y(2)}`;
      const eye = (x) =>
        `<ellipse cx="${X(x)}" cy="${Y(22.6)}" rx="${S(1.75)}" ry="${S(2.25)}" fill="${INK}"/><circle cx="${X(x + 0.6)}" cy="${Y(21.7)}" r="${S(0.55)}" fill="#fff"/>`;
      return `<defs><clipPath id="hc"><circle ${head}/></clipPath></defs>
<path d="${tuft}" fill="none" stroke="${CREAM}" stroke-width="${S(2.2) + 16}" stroke-linecap="round"/>
<circle ${head} fill="${SKIN}"/>
<path d="M${X(3.4)} ${Y(5.4)} H${X(32.6)} V${Y(22.5)} Q${X(18)} ${Y(9)} ${X(3.4)} ${Y(22.5)} Z" fill="${HAIR}" clip-path="url(#hc)"/>
<circle ${head} fill="none" stroke="${CREAM}" stroke-width="16"/>
<path d="${tuft}" fill="none" stroke="${HAIR}" stroke-width="${S(2.2)}" stroke-linecap="round"/>
${eye(13.2)}${eye(22.8)}
<ellipse cx="${X(10.4)}" cy="${Y(26)}" rx="${S(1.6)}" ry="${S(0.85)}" fill="${BLUSH}" opacity=".7"/><ellipse cx="${X(25.6)}" cy="${Y(26)}" rx="${S(1.6)}" ry="${S(0.85)}" fill="${BLUSH}" opacity=".7"/>
<path d="M${X(15.6)} ${Y(26.8)} Q${X(18)} ${Y(28.9)} ${X(20.4)} ${Y(26.8)}" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>`;
    },
  },
  peek: {
    k: 17,
    cy: 19,
    draw: (X, Y, S) => {
      const head = `cx="${X(18)}" cy="${Y(14.6)}" r="${S(10)}"`;
      const hands = [10.4, 25.6].map((x) => `<circle cx="${X(x)}" cy="${Y(21.5)}" r="${S(1.9)}" fill="${SKIN}" stroke="${CREAM}" stroke-width="10"/>`).join('');
      return `<defs><clipPath id="hc"><circle ${head}/></clipPath></defs>
<circle ${head} fill="${SKIN}"/>
<path d="M${X(5)} ${Y(2)} H${X(31)} V${Y(15.8)} Q${X(18)} ${Y(4.4)} ${X(5)} ${Y(15.8)} Z" fill="${HAIR}" clip-path="url(#hc)"/>
<circle ${head} fill="none" stroke="${CREAM}" stroke-width="16"/>
<ellipse cx="${X(14)}" cy="${Y(16.6)}" rx="${S(1.6)}" ry="${S(2)}" fill="${INK}"/><ellipse cx="${X(22)}" cy="${Y(16.6)}" rx="${S(1.6)}" ry="${S(2)}" fill="${INK}"/>
<ellipse cx="${X(11.6)}" cy="${Y(19.4)}" rx="${S(1.5)}" ry="${S(0.8)}" fill="${BLUSH}" opacity=".7"/><ellipse cx="${X(24.4)}" cy="${Y(19.4)}" rx="${S(1.5)}" ry="${S(0.8)}" fill="${BLUSH}" opacity=".7"/>
<path d="M${X(16.9)} ${Y(19.4)} Q${X(18)} ${Y(20.4)} ${X(19.1)} ${Y(19.4)}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
<rect x="${X(5)}" y="${Y(21.3)}" width="${S(26)}" height="${S(12)}" rx="${S(3.4)}" fill="${ORANGE}" stroke="${CREAM}" stroke-width="14"/>
<path d="M${X(13.8)} ${Y(27.4)} L${X(16.7)} ${Y(30)} L${X(22.2)} ${Y(24.6)}" fill="none" stroke="#fff" stroke-width="${S(2.3)}" stroke-linecap="round" stroke-linejoin="round"/>
${hands}`;
    },
  },
};

// favicon: true → 그림자 없이 둥근 사각형만 꽉 차게 (파비콘, 설정 화면 로고)
export function appIconSvg({ kind = DEFAULT_TRAY, favicon = false } = {}) {
  if (!APP_ART[kind] && DRAFTS[kind]) return appOf(DRAFTS[kind].color, favicon);
  const art = APP_ART[kind] || APP_ART.face;
  const n = (v) => +v.toFixed(1);
  const X = (x) => n(512 + (x - 18) * art.k);
  const Y = (y) => n(522 + (y - art.cy) * art.k);
  const S = (v) => n(v * art.k);
  const shadow = favicon ? '' : '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity=".35"/></filter>';
  return wrap(
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F6E5E"/><stop offset="1" stop-color="#173A33"/></linearGradient>${shadow}</defs>
<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"${favicon ? '' : ' filter="url(#sh)"'}/>
${art.draw(X, Y, S)}`,
    favicon ? '100 100 824 824' : '0 0 1024 1024',
  );
}

// SVG 글자를 캔버스로 (크기는 정사각형 한 변)
export async function svgCanvas(svg, size) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c;
}

// ---------- 앱 아이콘 + 상단바 아이콘 초안 (36칸에 그리고, 앱 아이콘은 초록 바탕에 키운다) ----------
const SH = '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity=".35"/></filter>';
const BG = '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F6E5E"/><stop offset="1" stop-color="#173A33"/></linearGradient>';
// favicon: true → 그림자 없이 둥근 사각형만 꽉 차게 (파비콘, 설정 화면 로고)
const appOf = (body36, favicon = false) =>
  wrap(
    `<defs>${BG}${favicon ? '' : SH}</defs><rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"${favicon ? '' : ' filter="url(#sh)"'}/><g transform="translate(212 212) scale(16.667)">${body36}</g>`,
    favicon ? '100 100 824 824' : '0 0 1024 1024',
  );
const BUBBLE = 'M13 5 H23 A9 9 0 0 1 32 14 V17 A9 9 0 0 1 23 26 H14 L8.5 31 V25.2 A9 9 0 0 1 4 17 V14 A9 9 0 0 1 13 5 Z';
const eyes = (y, dx = 4.5, rx = 1.7, ry = 2.2, fill = '#2A2320') =>
  `<ellipse cx="${18 - dx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/><ellipse cx="${18 + dx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const shine = (y, dx = 4.5) => `<circle cx="${18 - dx + 0.6}" cy="${y - 0.9}" r=".55" fill="#fff"/><circle cx="${18 + dx + 0.6}" cy="${y - 0.9}" r=".55" fill="#fff"/>`;
const cheeks = (y, dx = 7.4) => `<ellipse cx="${18 - dx}" cy="${y}" rx="1.5" ry=".8" fill="#F6A6C1" opacity=".85"/><ellipse cx="${18 + dx}" cy="${y}" rx="1.5" ry=".8" fill="#F6A6C1" opacity=".85"/>`;
const smile = (y, w = 2.4, color = '#2A2320', sw = 1.3) => `<path d="M${18 - w} ${y} Q18 ${y + 2.2} ${18 + w} ${y}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
const line = (d, sw = 2.4) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;

export const DRAFTS = {
  bubble: {
    name: '말풍선 친구',
    note: '보고하러 오는 말풍선이 그대로 캐릭터',
    tray: wrap(`${line(BUBBLE)}${eyes(15)}${line('M15.6 19.4 Q18 21.6 20.4 19.4', 1.9)}`),
    color: (`<path d="${BUBBLE}" fill="#FFF6E8"/>${eyes(15)}${shine(15)}${cheeks(18.6)}${smile(19.2)}`),
  },
  room: {
    name: '아이소 작업실',
    note: '앱 속 3D 작업실을 그대로 작게',
    tray: wrap(`${line('M4 23 V11 L18 4 L32 11 V23 L18 30 Z', 2.3)}${line('M4 23 L18 16 L32 23 M18 16 V4', 1.9)}<path d="M7.4 13.6 L11.6 11.5 V15.3 L7.4 17.4 Z"/><circle cx="18" cy="22.3" r="2.6"/>`),
    color: (`<path d="M4 23 L18 16 L32 23 L18 30 Z" fill="#F3E6D0"/><path d="M4 23 V11 L18 4 V16 Z" fill="#CFE8DD"/><path d="M18 16 V4 L32 11 V23 Z" fill="#E6F3ED"/>
<path d="M7.2 13.6 L12 11.2 V15.6 L7.2 18 Z" fill="#8CCBF2"/><path d="M22.4 11.4 L27.4 13.9 V17.6 L22.4 15.1 Z" fill="#FF8A3D"/>
<path d="M21 23.4 L24.2 21.8 L27.4 23.4 L24.2 25 Z" fill="#E2C49B"/><path d="M21 23.4 V24.6 L24.2 26.2 V25 Z" fill="#B98F62"/><path d="M27.4 23.4 V24.6 L24.2 26.2 V25 Z" fill="#CBA477"/>
<rect x="15.9" y="20.6" width="4.2" height="4.6" rx="1.8" fill="#FF8A3D"/><circle cx="18" cy="18.6" r="2.5" fill="#FFE6D2"/><path d="M15.5 18.4 A2.5 2.5 0 0 1 20.5 18.4 Q18 17.1 15.5 18.4 Z" fill="#2B2422"/>
<path d="M4 23 L18 30 L32 23" fill="none" stroke="#FFF6E8" stroke-width=".7" stroke-linejoin="round"/>`),
  },
  blob: {
    name: '말랑 새싹',
    note: '둥근 말랑이에 새싹 하나',
    tray: wrap(`<rect x="6" y="8.4" width="24" height="21.6" rx="10" fill="none" stroke="#000" stroke-width="2.4"/>${eyes(18, 4)}${line('M16 22.8 Q18 24.6 20 22.8', 1.9)}${line('M18 8.4 V5.4', 2)}<path d="M18 5.6 C15.6 5.8 14.2 4 14.2 2 C16.6 2 18 3.6 18 5.6 Z"/><path d="M18 5.2 C20.4 4.8 21.8 3 21.8 1.4 C19.4 1.4 18 3 18 5.2 Z"/>`),
    color: (`<path d="M18 9 V5.6" stroke="#FFF6E8" stroke-width="1.8" stroke-linecap="round"/><path d="M18 5.8 C15.6 6 14.2 4.2 14.2 2.2 C16.6 2.2 18 3.8 18 5.8 Z" fill="#A8E6CF"/><path d="M18 5.4 C20.4 5 21.8 3.2 21.8 1.6 C19.4 1.6 18 3.2 18 5.4 Z" fill="#A8E6CF"/>
<rect x="5.6" y="8.4" width="24.8" height="22" rx="10.4" fill="#FF8A3D"/><path d="M8.4 22 Q18 32 27.6 22 V24 Q27 29.6 21 30.2 H15 Q9 29.6 8.4 24 Z" fill="#E9742B" opacity=".55"/>${eyes(18, 4, 1.8, 2.4)}${shine(18, 4)}${cheeks(21.4, 7)}${smile(22.4, 2)}`),
  },
  screen: {
    name: '모니터 친구',
    note: '일하는 컴퓨터가 웃는 얼굴',
    tray: wrap(`<rect x="4" y="5" width="28" height="19" rx="4" fill="none" stroke="#000" stroke-width="2.4"/>${line('M18 24 V29.5 M12.5 30.5 H23.5')}${eyes(13.4, 4.4, 1.6, 2.1)}${line('M15.6 17.4 Q18 19.6 20.4 17.4', 1.9)}`),
    color: (`<rect x="3" y="4" width="30" height="21" rx="5" fill="#FFF6E8"/><rect x="5.6" y="6.6" width="24.8" height="15.8" rx="3" fill="#28366B"/>${eyes(13.4, 4.4, 1.6, 2.1, '#FFF6E8')}${cheeks(16.6, 7.2)}${smile(17.2, 2.4, '#FFF6E8', 1.3)}
<rect x="16.4" y="25" width="3.2" height="4.4" fill="#FFF6E8"/><rect x="11.5" y="29" width="13" height="2.6" rx="1.3" fill="#FFF6E8"/>`),
  },
  check: {
    name: '체크 말풍선',
    note: '“다 했어요” 보고 한 장',
    tray: wrap(`${line(BUBBLE)}${line('M12.4 15.4 L16.2 19 L23.6 11.8', 2.6)}`),
    color: (`<path d="${BUBBLE}" fill="#FF8A3D"/>${'<path d="M12.2 15.4 L16.2 19.2 L23.8 11.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'}`),
  },
  hand: {
    name: '손 든 친구',
    note: '끝나면 손 들고 보고하러 와요',
    tray: wrap(`<circle cx="14.5" cy="11.5" r="5.6" fill="none" stroke="#000" stroke-width="2.3"/><ellipse cx="12.6" cy="12" rx="1.05" ry="1.4"/><ellipse cx="16.4" cy="12" rx="1.05" ry="1.4"/><path d="M5.5 33 V26.5 A7 7 0 0 1 12.5 19.5 H16.5 A6.5 6.5 0 0 1 23 26 V33 Z"/>${line('M20.8 21.6 L26.8 9.6', 3.4)}<circle cx="27.6" cy="7.4" r="2.8"/>`),
    color: (`<path d="M5.5 33 V26.5 A7 7 0 0 1 12.5 19.5 H16.5 A6.5 6.5 0 0 1 23 26 V33 Z" fill="#FF8A3D"/><path d="M20.8 21.6 L26.8 9.6" stroke="#FF8A3D" stroke-width="3.6" stroke-linecap="round"/><circle cx="27.6" cy="7.4" r="2.8" fill="#FFE6D2"/>
<path d="M30.6 3.6 L32 2.2 M31.8 7 H33.6 M29.4 2.4 V.8" stroke="#FFD15C" stroke-width=".9" stroke-linecap="round"/>
<circle cx="14.5" cy="11.5" r="5.9" fill="#FFE6D2"/><path d="M8.6 11.2 A5.9 5.9 0 0 1 20.4 11.2 Q14.5 7.4 8.6 11.2 Z" fill="#2B2422"/><ellipse cx="12.4" cy="12.6" rx="1" ry="1.3" fill="#2A2320"/><ellipse cx="16.6" cy="12.6" rx="1" ry="1.3" fill="#2A2320"/><path d="M13.3 14.9 Q14.5 15.9 15.7 14.9" fill="none" stroke="#2A2320" stroke-width=".8" stroke-linecap="round"/>`),
  },
};
for (const d of Object.values(DRAFTS)) d.app = appOf(d.color);

// 상단바 아이콘 찾기: 기본 시안, 다른 시안, 초안 순서로
export const traySvg = (id) => TRAY[id] || DRAFTS[id]?.tray || TRAY[DEFAULT_TRAY] || DRAFTS[DEFAULT_TRAY].tray;
