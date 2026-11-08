// 처음 설정 / 에이전트 연동 화면
import { $, esc } from '/js/util.js';

const q = new URLSearchParams(location.search);
const TOKEN = q.get('t') || '';
let step = Math.min(4, Math.max(1, Number(q.get('step')) || 1));
let info = null;
let replay = false; // 처음 설정을 끝낸 뒤 튜토리얼을 다시 보는 중
const EMBED = q.get('embed') === '1'; // 작업실 앱 안 팝업으로 열렸을 때
if (EMBED) document.body.classList.add('embed');
const closeEmbed = () => parent.postMessage({ type: 'setup-close' }, location.origin);

const api = (path, body) =>
  fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const SRC = [
  { key: 'orca', name: 'Orca', badge: 'O', color: '#2A4A6B', desc: 'Orca에서 띄운 Claude, Codex' },
  { key: 'claude', name: 'Claude', badge: 'C', color: '#C15F3C', desc: '터미널, Claude 앱 Code 탭, VS Code' },
  { key: 'codex', name: 'Codex', badge: 'X', color: '#2A2F36', desc: 'Codex 앱, 터미널, VS Code' },
];
let icons = {}; // 이 Mac에 깔린 앱의 진짜 아이콘 (없으면 글자 배지)

// 상태: 짧은 표시(pill)와 한 줄 설명(detail)
function statusOf(key) {
  const d = info.detect[key] || {};
  const on = info.settings.sources[key] !== false;
  if (key === 'orca') {
    if (!d.installed) return { cls: 'off', pill: '설치 안 됨', detail: 'Orca가 이 Mac에 없어요', available: false };
    if (!on) return { cls: 'off', pill: '꺼 둠', detail: '켜면 보고를 받아요', available: true };
    if (d.ok) return { cls: 'ok', pill: '연결됨', detail: `에이전트 ${d.agents}명${d.working ? `, 지금 ${d.working}명 일하는 중` : ''}`, available: true };
    return { cls: 'warn', pill: '기다리는 중', detail: 'Orca를 켜면 연결돼요', available: true, title: d.error || '' };
  }
  const nm = key === 'claude' ? 'Claude' : 'Codex';
  if (!d.found) return { cls: 'off', pill: '기록 없음', detail: `${nm}를 쓴 기록이 아직 없어요`, available: false };
  if (!on) return { cls: 'off', pill: '꺼 둠', detail: '켜면 보고를 받아요', available: true };
  if (d.recent) return { cls: 'ok', pill: '찾았어요', detail: `최근 7일 동안 ${d.recent}번 썼어요`, available: true };
  return { cls: 'warn', pill: '찾았어요', detail: '최근 7일엔 쓴 기록이 없어요', available: true };
}

function renderSources() {
  if (!info) return;
  $('srcs').innerHTML = SRC.map((s) => {
    const st = statusOf(s.key);
    const on = info.settings.sources[s.key] !== false && st.available;
    const d = info.detect[s.key] || {};
    const chips = (d.apps || []).map((a) => `<span>${esc(a.name)}<em>${a.n}</em></span>`).join('');
    const icon = icons[s.key];
    return `<div class="src${on ? ' on' : ''}${st.available ? '' : ' na'}" title="${esc(d.dir || '')}">
      ${icon ? `<div class="sbadge img"><img src="${esc(icon)}" alt=""></div>` : `<div class="sbadge" style="background:${s.color}">${s.badge}</div>`}
      <div class="smain"><b>${s.name}</b><span class="sdesc">${esc(s.desc)}</span>
        <span class="sstat"><span class="spill ${st.cls}" title="${esc(st.title || '')}">${esc(st.pill)}</span>${esc(st.detail)}</span>
        ${chips ? `<div class="chips">${chips}</div>` : ''}</div>
      <span class="switch"><input type="checkbox" data-src="${s.key}" ${on ? 'checked' : ''} ${st.available ? '' : 'disabled'} aria-label="${s.name} 연동"><i></i></span>
    </div>`;
  }).join('');
  const t = new Date();
  $('scanAt').textContent = `${t.getHours()}시 ${String(t.getMinutes()).padStart(2, '0')}분에 찾았어요`;
}

function renderMaps() {
  for (const b of document.querySelectorAll('.mapc')) b.setAttribute('aria-pressed', String(b.dataset.map === (info?.settings.map || 'office')));
}
$('maps').addEventListener('click', async (e) => {
  const b = e.target.closest('.mapc');
  if (!b || !info) return;
  info.settings.map = b.dataset.map;
  renderMaps();
  await api('/api/settings', { map: b.dataset.map });
});

function renderOptions() {
  if (!info) return;
  renderMaps();
  $('optHide').checked = !!info.settings.hideResting;
  $('optNotify').checked = info.settings.notify !== false;
  $('optSound').checked = info.settings.sound !== false;
  $('optLogin').checked = !!info.login;
  $('loginRow').hidden = !info.electron;
  if (!$('bossName').value) $('bossName').value = info.settings.bossName && info.settings.bossName !== '나' ? info.settings.bossName : '';
}

function show(n) {
  if (step === 1 && n !== 1) saveName(); // 이름 칸을 떠날 때 저장
  step = n;
  for (const p of document.querySelectorAll('.spage')) {
    p.hidden = Number(p.dataset.step) !== n;
    if (!p.hidden) p.scrollTop = 0; // 단계를 바꾸면 맨 위부터
  }
  for (const li of document.querySelectorAll('#steps li')) {
    const k = Number(li.dataset.n);
    li.classList.toggle('on', k === n);
    li.classList.toggle('done', k < n);
  }
  $('prev').hidden = n === 1;
  $('next').textContent = n === 4 ? (replay ? '완료' : '시작하기') : '다음';
  if (n === 1) setTimeout(() => $('bossName').focus(), 50);
}

async function saveName() {
  if (!info) return; // 설정을 읽기 전에는 저장하지 않는다 (지금 이름을 빈 값으로 덮지 않게)
  const v = $('bossName').value.trim() || '나';
  if (v === info.settings.bossName) return;
  info.settings.bossName = v;
  await api('/api/settings', { bossName: v });
}

async function finish() {
  await saveName();
  if (EMBED) return closeEmbed();
  await api('/api/setup-done', {});
  // 브라우저로 열었을 때는 바로 작업실로
  setTimeout(() => (location.href = `/?t=${TOKEN}`), 400);
}

$('next').onclick = () => {
  if (step < 4) show(step + 1);
  else finish();
};
// 위의 단계 표시를 눌러서 원하는 단계로 바로 간다
for (const li of document.querySelectorAll('#steps li')) {
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.addEventListener('click', () => show(Number(li.dataset.n)));
  li.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    show(Number(li.dataset.n));
  });
}
$('prev').onclick = () => show(Math.max(1, step - 1));
$('skip').onclick = finish;
$('tryDemo').onclick = async () => {
  await api('/api/demo', {});
  finish();
};
$('rescan').onclick = async () => {
  $('rescan').disabled = true;
  info = await api('/api/rescan', {});
  $('rescan').disabled = false;
  renderSources();
};
$('srcs').addEventListener('change', async (e) => {
  const key = e.target.dataset.src;
  if (!key) return;
  info.settings.sources[key] = e.target.checked;
  renderSources();
  await api('/api/settings', { sources: { [key]: e.target.checked } });
  setTimeout(async () => {
    info = await api('/api/setup');
    renderSources();
  }, 1300);
});
$('optNotify').onchange = (e) => api('/api/settings', { notify: e.target.checked });
$('optSound').onchange = (e) => api('/api/settings', { sound: e.target.checked });
$('optHide').onchange = (e) => api('/api/settings', { hideResting: e.target.checked });
$('optLogin').onchange = (e) => api('/api/settings', { login: e.target.checked });
$('bossName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('next').click();
});
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target === document.body) $('next').click();
  if (e.key === 'Escape' && EMBED) closeEmbed();
});

async function load() {
  try {
    [info, icons] = await Promise.all([api('/api/setup'), api('/api/app-icons').catch(() => ({}))]);
  } catch {
    $('srcs').innerHTML = '<div class="sloading">작업실 서버와 연결하지 못했어요.</div>';
    return;
  }
  renderSources();
  renderOptions();
  replay = !!info.settings.setupDone;
  if (replay) {
    document.title = '에이전트 작업실 튜토리얼';
    $('skip').textContent = '닫기';
    if (step === 4) $('next').textContent = '완료';
  }
}
show(step);
load();
// 연동 화면을 보는 동안에는 상태를 계속 새로 고친다 (Orca를 켜면 바로 연결됨으로)
setInterval(async () => {
  if (step !== 2 || document.hidden) return;
  try {
    info = await api('/api/setup');
    renderSources();
  } catch {}
}, 4000);
