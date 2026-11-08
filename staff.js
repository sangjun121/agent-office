// 충성도와 직급: 같은 종류(Claude, Codex)의 에이전트가 같은 저장소에서 일하면 한 직원으로 본다.
// 세션이 바뀌어도 점수가 이어진다. 기록은 이 Mac의 설정 파일에만 남는다.
const RANKS = [
  [0, '인턴'],
  [20, '사원'],
  [40, '대리'],
  [60, '과장'],
  [80, '부장'],
  [95, '오른팔'],
];
const rankOf = (pts) => {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (pts >= RANKS[i][0]) r = i;
  return r;
};
const TYPE = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };
// 에이전트나 보고 하나에서 직원 열쇠와 이름을 만든다 (연습 에이전트는 빼고)
function staffOf(x) {
  if (!x || x.demo) return null;
  const repo = x.worktree?.repo || x.repo || x.worktree?.name || '';
  const who = TYPE[x.type] || '에이전트';
  const where = repo || x.app || '기타';
  return { key: `${x.type || 'agent'}|${where}`, name: `${who} · ${where}` };
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const DAY = 24 * 3600 * 1000;

function createStaff({ get, save }) {
  const promos = []; // 최근 승진 (화면에서 폭죽을 터뜨린다)
  let promoSeq = 0;

  function entry(st) {
    const all = get();
    const s = all[st.key] || (all[st.key] = { pts: 0, name: st.name, since: Date.now(), lastDay: '', dDay: '', dPts: 0, caps: {} });
    s.name = st.name;
    return s;
  }
  // 점수 올리고 내리기. cap: 하루에 이 일로 바뀔 수 있는 횟수
  function bump(x, delta, why, cap) {
    const st = staffOf(x);
    if (!st) return null;
    const s = entry(st);
    const d = today();
    if (cap) {
      const c = s.caps[why];
      if (!c || c.day !== d) s.caps[why] = { day: d, n: 0 };
      if (s.caps[why].n >= cap) return s;
      s.caps[why].n++;
    }
    if (s.dDay !== d) {
      s.dDay = d;
      s.dPts = 0;
    }
    const before = rankOf(s.pts);
    s.pts = Math.max(0, Math.min(100, s.pts + delta));
    s.dPts += delta;
    s.last = { delta, why, at: Date.now() };
    const after = rankOf(s.pts);
    if (after > before) {
      promos.unshift({ id: ++promoSeq, key: st.key, name: s.name, rank: after, title: RANKS[after][1], at: Date.now() });
      promos.length = Math.min(promos.length, 20);
    }
    save();
    return s;
  }

  return {
    RANKS,
    staffOf,
    // 일을 잘 끝냄 +2, 중단됨 -1
    onReport(r) {
      if (r.kind === 'done') bump(r, 2, '일을 잘 끝냈어요');
      else if (r.kind === 'interrupted') bump(r, -1, '일이 중단됐어요');
    },
    // 매일 처음 일을 시작하면 출근 +1
    onWork(a) {
      const st = staffOf(a);
      if (!st) return;
      const s = entry(st);
      if (s.lastDay === today()) return;
      s.lastDay = today();
      bump(a, 1, '오늘도 출근했어요');
    },
    // 확인 필요에 빨리 답하면 +5 (30분 안이면 +2)
    onAnswered(a, ms) {
      if (ms < 5 * 60000) bump(a, 5, '확인 요청에 바로 답해 줬어요');
      else if (ms < 30 * 60000) bump(a, 2, '확인 요청에 답해 줬어요');
    },
    // 보고를 10분 안에 읽으면 +3
    onRead(r) {
      if (r.kind !== 'attention' && Date.now() - r.at < 10 * 60000) bump(r, 3, '보고를 바로 읽어 줬어요');
    },
    // 보고를 하루 넘게 안 읽으면 -2 (보고마다 한 번)
    checkStale(reports) {
      for (const r of reports)
        if (!r.read && !r.stale && r.kind !== 'attention' && Date.now() - r.at > DAY) {
          r.stale = true;
          bump(r, -2, '보고를 하루 넘게 안 읽었어요');
        }
    },
    heart: (x) => bump(x, 1, '하트를 받았어요', 5),
    shot: (x) => bump(x, -1, '종이 총에 맞았어요', 3),
    // 화면에 보낼 것: 직원별 점수와 직급, 최근 승진
    view() {
      const all = get();
      const out = {};
      const d = today();
      for (const [k, s] of Object.entries(all)) out[k] = { name: s.name, pts: s.pts, rank: rankOf(s.pts), today: s.dDay === d ? s.dPts : 0, last: s.last || null };
      return { staff: out, promos, ranks: RANKS.map(([pts, title]) => ({ pts, title })) };
    },
  };
}

module.exports = { createStaff, staffOf, rankOf, RANKS };
