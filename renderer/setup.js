// 처음 설정 / 에이전트 연동 화면
import { $, esc } from '/js/util.js';

const q = new URLSearchParams(location.search);
const TOKEN = q.get('t') || '';
let step = Math.min(4, Math.max(1, Number(q.get('step')) || 1));
let info = null;

const api = (path, body) =>
  fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const SRC = [
  { key: 'orca', name: 'Orca', badge: 'O', color: '#2A4A6B', desc: 'Orca에서 띄운 Claude·Codex 에이전트' },
  { key: 'claude', name: 'Claude', badge: 'C', color: '#C15F3C', desc: '터미널 claude, Claude 데스크톱 Code 탭, VS Code' },
  { key: 'codex', name: 'Codex', badge: 'X', color: '#2A2F36', desc: 'Codex CLI, Codex 앱, VS Code' },
];

function statusOf(key) {
  const d = info.detect[key] || {};
  const on = info.settings.sources[key] !== false;
  if (key === 'orca') {
    if (!d.installed) return { cls: 'off', text: 'Orca가 설치돼 있지 않아요', available: false };
    if (!on) return { cls: 'off', text: '꺼 둠', available: true };
    if (d.ok) return { cls: 'ok', text: `연결됨 · 에이전트 ${d.agents}개${d.working ? ` · 지금 ${d.working}개 일하는 중` : ''}`, available: true };
    return { cls: 'warn', text: 'Orca를 켜면 연결돼요', available: true, title: d.error || '' };
  }
  if (!d.found) return { cls: 'off', text: `${key === 'claude' ? 'Claude' : 'Codex'} 기록이 없어요`, available: false };
  if (!on) return { cls: 'off', text: '꺼 둠', available: true };
  if (d.recent) return { cls: 'ok', text: `찾았어요 · 최근 7일 세션 ${d.recent}개`, available: true };
  return { cls: 'warn', text: '찾았어요 · 최근 7일엔 쓴 기록이 없어요', available: true };
}

function renderSources() {
  if (!info) return;
  $('srcs').innerHTML = SRC.map((s) => {
    const st = statusOf(s.key);
    const on = info.settings.sources[s.key] !== false && st.available;
    const d = info.detect[s.key] || {};
    const chips = (d.apps || []).map((a) => `<span>${esc(a.name)}<em>${a.n}</em></span>`).join('');
    const where = s.key === 'orca' ? '' : d.dir ? `<span>${esc(d.dir)}</span>` : '';
    return `<div class="src${on ? ' on' : ''}${st.available ? '' : ' na'}">
      <div class="sbadge" style="background:${s.color}">${s.badge}</div>
      <div class="smain"><b>${s.name}</b><span class="sdesc">${esc(s.desc)}</span>
        <span class="spill ${st.cls}" title="${esc(st.title || '')}">${esc(st.text)}</span>
        ${chips || where ? `<div class="chips">${chips}${where}</div>` : ''}</div>
      <span class="switch"><input type="checkbox" data-src="${s.key}" ${on ? 'checked' : ''} ${st.available ? '' : 'disabled'} aria-label="${s.name} 연동"><i></i></span>
    </div>`;
  }).join('');
  const t = new Date();
  $('scanAt').textContent = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}에 찾았어요`;
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
  step = n;
  for (const p of document.querySelectorAll('.spage')) p.hidden = Number(p.dataset.step) !== n;
  for (const li of document.querySelectorAll('#steps li')) {
    const k = Number(li.dataset.n);
    li.classList.toggle('on', k === n);
    li.classList.toggle('done', k < n);
  }
  $('prev').hidden = n === 1;
  $('next').textContent = n === 4 ? '시작하기' : '다음';
  if (n === 1) setTimeout(() => $('bossName').focus(), 50);
}

async function saveName() {
  const v = $('bossName').value.trim();
  await api('/api/settings', { bossName: v || '나' });
}

async function finish() {
  await saveName();
  await api('/api/setup-done', {});
  // 브라우저로 열었을 때는 바로 작업실로
  setTimeout(() => (location.href = `/?t=${TOKEN}`), 400);
}

$('next').onclick = async () => {
  if (step === 1) await saveName();
  if (step < 4) show(step + 1);
  else finish();
};
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
});

async function load() {
  try {
    info = await api('/api/setup');
  } catch {
    $('srcs').innerHTML = '<div class="sloading">작업실 서버와 연결하지 못했어요.</div>';
    return;
  }
  renderSources();
  renderOptions();
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
