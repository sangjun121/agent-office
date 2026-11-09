// README 그림과 홍보 영상: 가짜 에이전트 데이터로 맥 바탕화면 위에 앱을 띄워 찍는다 (내 작업 기록은 읽지 않는다)
//   npm run shots  → docs/*.jpg (README 정지 화면)
//   npm run hero   → README 맨 위 움직이는 그림 프레임 (끝나면 webp로 굽는 ffmpeg 명령을 알려 준다)
//   npm run promo  → 자막 있는 홍보 영상 프레임 1920x1080 (끝나면 mp4로 굽는 ffmpeg 명령을 알려 준다)
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const MODE = ['stills', 'hero', 'promo'].find((m) => process.argv.includes(m)) || 'stills';
const OUT = MODE === 'stills' ? path.join(ROOT, 'docs') : path.join(os.tmpdir(), 'agent-office-record', MODE);
const { startServer } = require(path.join(ROOT, 'server.js'));
const { getAppIcons } = require(path.join(ROOT, 'appicons.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (f) => 'file://' + f.split(path.sep).map(encodeURIComponent).join('/');

// ---------- 무대 크기 (CSS px) ----------
const SW = 1600;
const SH = 900;
const WIN = { x: 160, y: 56, w: 1280, h: 736 };
const Z = MODE === 'stills' ? 2 : 1.2;

// ---------- 가짜 에이전트: 감독이 시간에 맞춰 상태를 바꾼다 ----------
const T0 = Date.now();
const dir = { done: false, doneAt: 0, attn: false, attnAt: 0 };
function fixture() {
  const now = Date.now();
  const a = (o) => ({
    outcome: null, interrupted: false, tool: '', toolHint: '', message: '', updatedAt: now, stateStartedAt: T0,
    worktree: { name: o.name, repo: o.repo, branch: o.branch, path: '', host: 'local' }, ...o,
  });
  return [
    a({ id: 'f1', name: '로그인 버그 고치기', state: 'working', type: 'claude', app: '터미널 Claude', tool: 'Edit', toolHint: 'auth.ts', prompt: '로그인하면 가끔 401이 나는 버그를 찾아서 고쳐 줘', repo: 'shop-web', branch: 'fix/login' }),
    a({
      id: 'f2', name: '결제 API 정리', type: 'codex', app: 'Codex 앱', prompt: '결제 API 응답 형식을 하나로 맞춰 줘', repo: 'shop-api', branch: 'refactor/payment',
      ...(dir.done
        ? { state: 'done', outcome: 'success', stateStartedAt: dir.doneAt, message: '결제 API 응답을 { ok, data, error } 한 가지 형식으로 맞췄어요. 바뀐 엔드포인트는 7개이고, 테스트 48개가 모두 통과했어요.' }
        : { state: 'working', tool: 'shell', toolHint: 'pnpm test' }),
    }),
    a({
      id: 'f3', name: 'README 다듬기', type: 'claude', app: 'Orca', prompt: 'README 설치 방법을 정리해 줘', repo: 'docs', branch: 'docs/readme',
      ...(dir.attn ? { state: 'blocked', stateStartedAt: dir.attnAt, message: '설치 방법 문단을 새로 쓰려고 해요. 바꿔도 될까요?' } : { state: 'working', tool: 'Read', toolHint: 'README.md' }),
    }),
    a({ id: 'f4', name: '랜딩 페이지 문구', state: 'working', type: 'claude', app: 'Claude 데스크톱', tool: 'Write', toolHint: 'copy.md', prompt: '랜딩 페이지 첫 화면 문구를 세 가지 버전으로 써 줘', repo: 'landing', branch: 'main' }),
    a({ id: 'f5', name: '장바구니 테스트', state: 'working', type: 'claude', app: 'Orca', tool: 'Bash', toolHint: 'npm test', prompt: '장바구니 금액 계산 테스트를 추가해 줘', repo: 'shop-web', branch: 'test/cart' }),
    a({ id: 'f6', name: '다크 모드 색 정리', state: 'done', type: 'codex', app: '터미널 Codex', prompt: '다크 모드 색 변수를 정리해 줘', repo: 'design-system', branch: 'main', message: '다크 모드 색 변수 12개를 정리하고, 대비가 낮던 3개를 고쳤어요.', updatedAt: T0 - 25 * 60000, stateStartedAt: T0 - 25 * 60000 }),
    a({ id: 'f7', name: 'DB 마이그레이션', state: 'monitoring', type: 'claude', app: '터미널 Claude', prompt: '마이그레이션이 끝날 때까지 지켜봐 줘', repo: 'shop-api', branch: 'main' }),
    a({ id: 'f8', name: '이미지 최적화', state: 'working', type: 'codex', app: 'VS Code Codex', tool: 'apply_patch', toolHint: 'images.ts', prompt: '상품 이미지 로딩을 빠르게 해 줘', repo: 'shop-web', branch: 'perf/images' }),
  ];
}
// README 그림: 대화 보기에 이전 턴도 보이게 하는 가짜 대화 (내 세션 기록은 쓰지 않는다)
const CONVO = (id) =>
  id !== 'f2' || !dir.done
    ? null
    : {
        more: false,
        turns: [
          { prompt: '결제 API 응답에 어떤 형식들이 섞여 있는지 먼저 정리해 줘', at: T0 - 50 * 60000, end: T0 - 47 * 60000, tools: 6, interrupted: false,
            reply: '응답 형식이 세 가지 섞여 있어요.\n\n- `{ success, result }` 4곳\n- `{ ok, data }` 2곳\n- 형식 없이 값만 보내는 곳 1곳' },
          { prompt: '결제 API 응답 형식을 하나로 맞춰 줘', at: T0 - 40 * 60000, end: dir.doneAt, tools: 31, interrupted: false,
            reply: '결제 API 응답을 `{ ok, data, error }` 한 가지 형식으로 맞췄어요.\n\n## 바뀐 것\n- 엔드포인트 7개의 응답을 새 형식으로 바꿨어요\n- 클라이언트의 `parsePayment()`도 새 형식에 맞췄어요\n\n| 항목 | 결과 |\n| --- | --- |\n| 바뀐 엔드포인트 | 7개 |\n| 테스트 | 48개 통과 |' },
        ],
      };
const DETECT = {
  orca: { installed: true, enabled: true, ok: true, error: null, agents: 4, working: 2 },
  claude: { found: true, dir: '~/.claude/projects', recent: 18, apps: [{ name: '터미널 Claude', n: 9 }, { name: 'Claude 데스크톱', n: 6 }, { name: 'VS Code Claude', n: 3 }] },
  codex: { found: true, dir: '~/.codex/sessions', recent: 7, apps: [{ name: 'Codex 앱', n: 5 }, { name: 'VS Code Codex', n: 2 }] },
};
const TD = new Date();
const TODAY = `${TD.getFullYear()}-${TD.getMonth() + 1}-${TD.getDate()}`;
// codex|shop-api는 38점: 결제 API 정리 보고 한 번(+2)이면 대리로 승진한다
const STAFF = Object.fromEntries(
  [
    ['claude|docs', 'Claude · docs', 97, 2],
    ['codex|design-system', 'Codex · design-system', 81, 0],
    ['claude|shop-web', 'Claude · shop-web', 63, 3],
    ['codex|shop-api', 'Codex · shop-api', 38, 3],
    ['claude|landing', 'Claude · landing', 27, 1],
    ['codex|shop-web', 'Codex · shop-web', 35, 1],
    ['claude|shop-api', 'Claude · shop-api', 8, 1],
  ].map(([k, name, pts, d]) => [k, { pts, name, since: Date.now() - 9 * 86400000, lastDay: TODAY, dDay: TODAY, dPts: d, caps: {} }]),
);

// ---------- 무대 (맥 바탕화면 + 상단바 + 창) ----------
const F = (n) => fileUrl(path.join(ROOT, 'renderer', 'fonts', n));
const STAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: P; src: url('${F('PretendardVariable.woff2')}'); font-weight: 45 920; }
@font-face { font-family: Jua; src: url('${F('Jua-Regular.ttf')}'); }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${SW}px; height: ${SH}px; overflow: hidden; }
body { font-family: P, -apple-system, sans-serif; color: #1d1d1f; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(60% 70% at 85% 105%, rgba(16, 52, 45, .9) 0%, rgba(16, 52, 45, 0) 70%),
    radial-gradient(70% 80% at 8% -5%, #E3F1EA 0%, rgba(227, 241, 234, 0) 60%),
    linear-gradient(160deg, #A9D2C4 0%, #5E9D8C 42%, #2C5E53 78%, #173A33 100%); }
.bar { position: absolute; inset: 0 0 auto 0; height: 28px; display: flex; align-items: center; gap: 20px; padding: 0 16px;
  background: rgba(255, 255, 255, .5); font: 500 13.5px/1 -apple-system, P, sans-serif; color: #111; z-index: 20; }
.bar .apple { font-size: 15px; } .bar b { font-weight: 700; } .sp { flex: 1; }
#tray { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border-radius: 6px; font-weight: 600; transition: background .15s; }
#tray.on { background: rgba(0, 0, 0, .16); }
#tray img { width: 18px; height: 18px; display: block; }
#tray span:empty { display: none; }
.bar svg { width: 17px; height: 17px; }
.win { position: absolute; left: ${WIN.x}px; top: ${WIN.y}px; width: ${WIN.w}px; height: ${WIN.h}px; border-radius: 14px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .28), 0 30px 80px rgba(0, 0, 0, .42), 0 10px 24px rgba(0, 0, 0, .22); background: #173A33;
  transition: opacity .6s cubic-bezier(.22, 1, .36, 1), transform .6s cubic-bezier(.22, 1, .36, 1); }
.win.off { opacity: 0; transform: translateY(14px) scale(.985); }
.win iframe { display: block; width: 100%; height: 100%; border: 0; }
.win iframe.alt { position: absolute; inset: 0; opacity: 0; transition: opacity .35s; }
.win iframe.alt.on { opacity: 1; }
.tl { position: absolute; left: 18px; top: 20px; display: flex; gap: 8px; z-index: 2; pointer-events: none; }
.tl i { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 .5px rgba(0, 0, 0, .2); }
.pop { position: absolute; top: 33px; width: 440px; height: 396px; border-radius: 12px; overflow: hidden; z-index: 15;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .25), 0 26px 70px rgba(0, 0, 0, .45); opacity: 0; transform: translateY(-6px); transition: opacity .22s, transform .22s, height .3s; }
.pop.on { opacity: 1; transform: none; }
.pop iframe { display: block; width: 100%; height: 100%; border: 0; }
.note { position: absolute; top: 38px; right: 12px; width: 372px; display: grid; grid-template-columns: 38px 1fr; gap: 10px; padding: 12px 14px;
  border-radius: 18px; background: rgba(246, 246, 246, .9); backdrop-filter: blur(24px); box-shadow: 0 0 0 .5px rgba(0, 0, 0, .18), 0 12px 32px rgba(0, 0, 0, .28);
  font: 13px/1.35 -apple-system, P, sans-serif; z-index: 25; transform: translateX(420px); transition: transform .45s cubic-bezier(.22, 1, .36, 1); }
.note.on { transform: none; }
.note img { width: 38px; height: 38px; }
.note b { display: block; font-weight: 600; } .note small { float: right; color: #777; font-size: 12px; }
.note .sub { display: block; font-weight: 500; } .note p { margin: 2px 0 0; color: #333; }
.cap { position: absolute; left: 0; right: 0; top: ${WIN.y + WIN.h + 26}px; text-align: center; font: 600 30px/1.3 P, sans-serif; color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, .35); opacity: 0; transform: translateY(8px); transition: opacity .4s, transform .4s cubic-bezier(.22, 1, .36, 1); z-index: 30; }
.cap.on { opacity: 1; transform: none; }
.card { position: absolute; inset: 0; display: grid; place-items: center; z-index: 40; opacity: 0; transition: opacity .6s;
  background:
    radial-gradient(60% 70% at 85% 105%, rgba(16, 52, 45, .9) 0%, rgba(16, 52, 45, 0) 70%),
    radial-gradient(70% 80% at 8% -5%, #E3F1EA 0%, rgba(227, 241, 234, 0) 60%),
    linear-gradient(160deg, #A9D2C4 0%, #5E9D8C 42%, #2C5E53 78%, #173A33 100%); }
.card.on { opacity: 1; }
.card > div { display: grid; justify-items: center; gap: 14px; text-align: center; color: #fff; }
.card img { width: 132px; height: 132px; filter: drop-shadow(0 18px 30px rgba(0, 0, 0, .35)); }
.card h1 { margin: 6px 0 0; font: 76px/1.1 Jua, P, sans-serif; text-shadow: 0 4px 22px rgba(0, 0, 0, .3); }
.card p { margin: 0; font: 500 30px/1.4 P, sans-serif; opacity: .94; text-shadow: 0 2px 12px rgba(0, 0, 0, .3); }
.card .url { margin-top: 10px; padding: 10px 20px; border-radius: 12px; background: rgba(0, 0, 0, .28); font: 600 24px/1 P, sans-serif; letter-spacing: .01em; }
.cur { position: absolute; left: 0; top: 0; width: 26px; height: 26px; z-index: 50; opacity: 0; pointer-events: none;
  transition: left .9s cubic-bezier(.45, 0, .2, 1), top .9s cubic-bezier(.45, 0, .2, 1), opacity .2s; }
.cur.on { opacity: 1; } .cur svg { width: 26px; height: 26px; transition: transform .12s; transform-origin: 4px 3px; } .cur.down svg { transform: scale(.85); }
</style></head><body>
<div class="bar"><b>Finder</b><span>파일</span><span>편집</span><span>보기</span><span>이동</span><span>윈도우</span><span>도움말</span><span class="sp"></span>
  <span id="tray"><img src="${fileUrl(path.join(ROOT, 'assets', 'trayTemplate@2x.png'))}" alt=""><span id="trayN"></span></span>
  <svg viewBox="0 0 20 20" fill="none" stroke="#111" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 7.5a11 11 0 0 1 15 0M5 10.3a7.2 7.2 0 0 1 10 0M7.6 13a3.4 3.4 0 0 1 4.8 0"/><circle cx="10" cy="15.6" r="1" fill="#111" stroke="none"/></svg>
  <span>11월 9일 (일) 오후 2:41</span></div>
<div class="win off" id="win"><div class="tl"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div><iframe id="app"></iframe><iframe id="map-stadium" class="alt"></iframe><iframe id="map-paris" class="alt"></iframe></div>
<div class="pop" id="pop"><iframe id="mini"></iframe></div>
<div class="note" id="note"><img src="${fileUrl(path.join(ROOT, 'renderer', 'favicon.svg'))}" alt=""><span><small>지금</small><b id="nT"></b><span class="sub" id="nS"></span><p id="nB"></p></span></div>
<div class="cap" id="cap"></div>
<div class="card" id="title"><div><img src="${fileUrl(path.join(ROOT, 'renderer', 'favicon.svg'))}" alt=""><h1>에이전트 작업실</h1><p>에이전트가 일을 끝내면, 내 자리로 보고하러 와요</p></div></div>
<div class="card" id="outro"><div><img src="${fileUrl(path.join(ROOT, 'renderer', 'favicon.svg'))}" alt=""><h1>에이전트 작업실</h1><p>무료 오픈소스예요. 인터넷을 쓰지 않아요.</p><span class="url">github.com/sangjun121/agent-office</span></div></div>
<div class="cur" id="cur"><svg viewBox="0 0 26 26"><path d="M4 2.5v18.2l4.6-4.4 2.9 6.6 3.1-1.4-2.9-6.5h6.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
<script>
const $ = (id) => document.getElementById(id);
window.S = {
  on: (id, v = true) => $(id).classList.toggle('on', v),
  off: (id, v = true) => $(id).classList.toggle('off', v),
  cap: async (t) => { const c = $('cap'); c.classList.remove('on'); await new Promise((r) => setTimeout(r, t && c.textContent ? 260 : 0)); c.textContent = t || ''; if (t) c.classList.add('on'); },
  tray: (n) => { $('trayN').textContent = n ? String(n) : ''; },
  note: (t, s, b) => { $('nT').textContent = t; $('nS').textContent = s; $('nB').textContent = b; $('note').classList.add('on'); },
  cur: (x, y, ms = 900) => { const c = $('cur'); c.style.transitionDuration = ms + 'ms, ' + ms + 'ms, .2s'; c.style.left = x + 'px'; c.style.top = y + 'px'; },
  click: () => { const c = $('cur'); c.classList.add('down'); setTimeout(() => c.classList.remove('down'), 140); },
  trayPos: () => { const r = $('tray').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.right }; },
};
</script></body></html>`;

// ---------- 녹화 ----------
let win;
const js = (code) => win.webContents.executeJavaScript(code);
const frameOf = (prefix) => win.webContents.mainFrame.framesInSubtree.find((f) => f !== win.webContents.mainFrame && f.url.startsWith(prefix));
let appUrl;
let miniUrl;
const inApp = (code) => frameOf(appUrl.split('?')[0])?.executeJavaScript(code);
const inMini = (code) => {
  const f = win.webContents.mainFrame.framesInSubtree.find((x) => x.url.includes('mode=mini'));
  return f?.executeJavaScript(code);
};
const key = (code, type = 'keydown') => inApp(`dispatchEvent(new KeyboardEvent('${type}', { code: '${code}', bubbles: true }))`);
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await Promise.resolve().then(fn).catch(() => false)) return true;
    await sleep(150);
  }
  return false;
}
// 앱 화면 안의 요소 → 무대 좌표
async function stagePos(sel, fx = 0.5, fy = 0.5) {
  const r = await inApp(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  return r ? { x: WIN.x + r.x + r.w * fx, y: WIN.y + r.y + r.h * fy } : null;
}

let rec = false;
let t0 = 0;
let n = 0;
const frames = [];
let FR;
function startRec() {
  FR = path.join(OUT, 'frames');
  fs.rmSync(FR, { recursive: true, force: true });
  fs.mkdirSync(FR, { recursive: true });
  t0 = performance.now();
  rec = true;
}
function stopRec() {
  rec = false;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    lines.push(`file ${path.basename(f.f)}`);
    const next = frames[i + 1];
    lines.push(`duration ${((next ? next.t : f.t + 33) - f.t) / 1000}`);
  });
  lines.push(`file ${path.basename(frames[frames.length - 1].f)}`);
  fs.writeFileSync(path.join(FR, 'list.txt'), lines.join('\n') + '\n');
  const dur = frames.length ? (frames[frames.length - 1].t / 1000).toFixed(1) : 0;
  console.log(`프레임 ${frames.length}장, ${dur}초, 평균 ${(frames.length / dur).toFixed(1)}fps`);
}
// README 정지 화면: 2배로 찍어서 줄여 저장
async function still(name, crop) {
  let img = await win.webContents.capturePage();
  const s = img.getSize().width / SW;
  if (crop) img = img.crop({ x: Math.round(crop.x * s), y: Math.round(crop.y * s), width: Math.round(crop.w * s), height: Math.round(crop.h * s) });
  const w = crop ? Math.min(1600, crop.w * 2) : 1600;
  img = img.resize({ width: w, quality: 'best' });
  fs.writeFileSync(path.join(OUT, name), img.toJPEG(88));
  console.log('찍음:', name, img.getSize());
}

// 앱 안 읽은 보고 수를 상단바 숫자에 맞춘다 (진짜 앱의 상단바처럼)
let traySync = true;
async function trayLoop() {
  while (traySync) {
    const t = await inApp('document.title').catch(() => '');
    const m = /^\((\d+)\)/.exec(t || '');
    await js(`S.tray(${m ? m[1] : 0})`).catch(() => {});
    await sleep(250);
  }
}
const unread = async () => Number(/^\((\d+)\)/.exec((await inApp('document.title').catch(() => '')) || '')?.[1] || 0);

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const settingsPath = path.join(os.tmpdir(), `ao-rec-${MODE}.json`);
  fs.writeFileSync(settingsPath, JSON.stringify({ setupDone: true, bossName: '나', map: 'office', sound: false, notify: false, staff: STAFF }));
  const srv = await startServer({ port: 0, settingsPath, fixture, fixtureConvo: CONVO, fixtureDetect: DETECT, getAppIcons });
  appUrl = srv.url + '&debug=1';
  miniUrl = srv.url + '&mode=mini';
  const stagePath = path.join(os.tmpdir(), 'agent-office-stage.html');
  fs.writeFileSync(stagePath, STAGE);

  win = new BrowserWindow({ width: Math.round(SW * Z), height: Math.round(SH * Z), show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', (e, dirty, image) => {
    if (!rec) return;
    const f = path.join(FR, `f${String(++n).padStart(5, '0')}.jpg`);
    fs.writeFileSync(f, image.toJPEG(93));
    frames.push({ f, t: performance.now() - t0 });
  });
  await win.loadFile(stagePath);
  win.webContents.setZoomFactor(Z);
  await sleep(300);
  console.log('무대 크기', await js('[innerWidth, innerHeight]'));
  await js(`document.getElementById('app').src = ${JSON.stringify(appUrl)}`);
  await until(() => inApp("!!(window.__ao && __ao.agents.size >= 7 && document.getElementById('loading').classList.contains('done'))"));
  await sleep(1500);
  trayLoop();

  if (MODE === 'promo') await promo();
  else if (MODE === 'hero') await hero();
  else await stills(srv);
  traySync = false;
  srv.close();
  if (MODE === 'promo')
    console.log(`굽기: cd ${FR} && ffmpeg -f concat -safe 0 -i list.txt -vf "fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 18 -movflags +faststart agent-office-promo.mp4`);
  if (MODE === 'hero')
    console.log(`굽기: cd ${FR} && ffmpeg -f concat -safe 0 -i list.txt -vf "fps=15,crop=1920:998:0:0,scale=1200:-1:flags=lanczos" -c:v libwebp_anim -q:v 72 -compression_level 6 -loop 0 ${path.join(ROOT, 'docs', 'hero.webp')}`);
  app.quit();
});

// 축구장, 파리를 따로 띄운 서버 (같은 가짜 에이전트)
async function mapServers() {
  const out = {};
  for (const m of ['stadium', 'paris']) {
    const sp = path.join(os.tmpdir(), `ao-rec-${m}.json`);
    fs.writeFileSync(sp, JSON.stringify({ setupDone: true, bossName: '나', map: m, sound: false, notify: false, staff: STAFF }));
    out[m] = await startServer({ port: 0, settingsPath: sp, fixture, fixtureConvo: CONVO, fixtureDetect: DETECT, getAppIcons });
  }
  return out;
}
const inMap = (srv, code) => win.webContents.mainFrame.framesInSubtree.find((f) => f.url.startsWith(srv.url.split('?')[0]) && f !== frameOf(appUrl.split('?')[0]))?.executeJavaScript(code);

async function promo() {
  const maps = await mapServers();
  await js("S.on('title'); S.off('win', false)");
  await sleep(400);
  startRec();
  await sleep(2600);
  await js("S.on('title', false)");
  await sleep(700);
  await js("S.cap('에이전트 하나가 캐릭터 하나예요')");
  await sleep(2300);
  // 일이 끝나면 걸어와서 보고
  dir.done = true;
  dir.doneAt = Date.now();
  await sleep(1000);
  await js("S.cap('일이 끝나면 내 자리로 와서 보고해요')");
  await until(() => inApp("!!document.querySelector('.bub.report:not([hidden])')"), 15000);
  await sleep(2600);
  // 권한 필요
  dir.attn = true;
  dir.attnAt = Date.now();
  await js("S.cap('권한이 필요하면 손을 들고 알림을 보내요')");
  await until(() => inApp("(window.__ao.state().reports || []).some((r) => r.kind === 'attention')"), 8000);
  await sleep(500);
  await js("S.note('❗ README 다듬기 · 권한이 필요해요', 'Orca', '설치 방법 문단을 새로 쓰려고 해요. 바꿔도 될까요?')");
  await sleep(3200);
  await js("S.on('note', false)");
  // 보고함에서 자세히
  await js("S.cap('보고함에서 자세히 보고, 하던 앱을 바로 열어요')");
  const row = await stagePos('#inboxList li.unread:not(.k-attention)', 0.3, 0.45);
  await js(`S.cur(${WIN.x + WIN.w * 0.55}, ${WIN.y + WIN.h * 0.62}, 0); S.on('cur')`);
  await sleep(120);
  await js(`S.cur(${row.x}, ${row.y})`);
  await sleep(1000);
  await js('S.click()');
  await inApp("document.querySelector('#inboxList li.unread:not(.k-attention)').click()");
  await sleep(1700);
  const seen = await stagePos('#rSeen', 0.5, 0.55);
  await js(`S.cur(${seen.x}, ${seen.y}, 800)`);
  await sleep(950);
  await js('S.click()');
  await inApp("document.getElementById('rSeen').click()");
  await sleep(700);
  await inApp("document.getElementById('report').hidden || document.getElementById('rClose').click()"); // 다음 보고로 넘어가면 닫는다
  await sleep(300);
  // 직원 명부
  await js("S.cap('보고를 빨리 읽어 주면 승진해요')");
  const tab = await stagePos('.itabs [data-f=staff]');
  await js(`S.cur(${tab.x}, ${tab.y}, 800)`);
  await sleep(900);
  await js('S.click()');
  await inApp("document.querySelector('.itabs [data-f=staff]').click()");
  await sleep(2600);
  // 1인칭 (그사이 다른 맵을 미리 띄워 둔다)
  await js(`S.on('cur', false); document.getElementById('mini').src = ${JSON.stringify(miniUrl)}`);
  await js(`document.getElementById('map-stadium').src = ${JSON.stringify(maps.stadium.url + '&debug=1')}; document.getElementById('map-paris').src = ${JSON.stringify(maps.paris.url + '&debug=1')}`);
  await inApp("document.querySelector('.itabs [data-f=all]').click(); document.getElementById('inboxHide').click()");
  await js("S.cap('V를 누르면 내 눈높이로 둘러봐요')");
  await sleep(300);
  await key('KeyV');
  await sleep(1200);
  await key('ArrowLeft');
  await sleep(700);
  await key('ArrowLeft', 'keyup');
  await sleep(1400);
  await key('KeyV');
  await sleep(900);
  // 맵: 축구장 → 파리 (1인칭까지)
  for (const m of ['stadium', 'paris']) await inMap(maps[m], "document.getElementById('inboxHide')?.click()").catch(() => {});
  await js("S.cap('맵도 골라요. 축구장,')");
  await js("document.getElementById('map-stadium').classList.add('on')");
  await sleep(2100);
  await js("S.cap('파리까지')");
  await js("document.getElementById('map-paris').classList.add('on')");
  await sleep(1700);
  await inMap(maps.paris, "dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', bubbles: true }))").catch(() => {});
  await sleep(2300);
  await js("document.getElementById('map-paris').classList.remove('on'); document.getElementById('map-stadium').classList.remove('on')");
  await sleep(400);
  // 상단바
  await js("S.cap('상단바에서 언제든 슬쩍 확인해요')");
  const tp = await js('S.trayPos()');
  await js(`document.getElementById('pop').style.left = '${Math.round(Math.min(SW - 452, tp.x - 220))}px'`);
  await js(`S.cur(${WIN.x + WIN.w * 0.7}, ${WIN.y + 200}, 0); S.on('cur')`);
  await sleep(100);
  await js(`S.cur(${tp.x + 2}, ${tp.y + 1}, 900)`);
  await sleep(1000);
  await js("S.click(); S.on('tray'); S.on('pop')");
  await sleep(500);
  await js(`S.cur(${tp.x - 120}, ${tp.y + 300}, 900)`);
  await sleep(2600);
  await js("S.cap(''); S.on('cur', false); S.on('outro')");
  await sleep(3400);
  stopRec();
  for (const m of Object.values(maps)) m.close();
}

async function hero() {
  await js("S.off('win', false)");
  await sleep(800);
  startRec();
  await sleep(1200);
  dir.done = true;
  dir.doneAt = Date.now();
  await until(() => inApp("!!document.querySelector('.bub.report:not([hidden])')"), 15000);
  await sleep(3600);
  stopRec();
}

async function stills(srv) {
  await js("S.off('win', false)");
  await sleep(800);
  const CROP = { x: 0, y: 0, w: SW, h: WIN.y + WIN.h + 40 };
  // 1) 보고하러 온 장면
  dir.done = true;
  dir.doneAt = Date.now();
  await until(() => inApp("!!document.querySelector('.bub.report:not([hidden])')"), 15000);
  await sleep(900);
  await still('report-arrive.jpg', CROP);
  // 2) 권한 필요 + 알림
  dir.attn = true;
  dir.attnAt = Date.now();
  await until(() => inApp("(window.__ao.state().reports || []).some((r) => r.kind === 'attention')"), 8000);
  await sleep(1200);
  await js("S.note('❗ README 다듬기 · 권한이 필요해요', 'Orca', '설치 방법 문단을 새로 쓰려고 해요. 바꿔도 될까요?')");
  await sleep(900);
  await still('attention.jpg', CROP);
  await js("S.on('note', false)");
  // 3) 보고 자세히
  await inApp("document.querySelector('#inboxList li.unread:not(.k-attention)').click()");
  await sleep(900);
  await still('report.jpg', CROP);
  await inApp("document.getElementById('rSeen').click()");
  await sleep(600);
  // 봤어요를 누르면 다음 보고로 넘어가니 대화 창을 닫는다
  await inApp("document.getElementById('report').hidden || document.getElementById('rClose').click()");
  await sleep(400);
  // 4) 직원 명부
  await inApp("document.querySelector('.itabs [data-f=staff]').click()");
  await sleep(900);
  await still('staff.jpg', CROP);
  await inApp("document.querySelector('.itabs [data-f=all]').click()");
  // 5) 캐릭터 카드 (이름 바꾸기) — 결제 API 정리 에이전트를 누른 것처럼
  await inApp("(() => { const a = [...__ao.agents.values()].find((x) => x.id === 'f2'); const r = a.lbl.el.getBoundingClientRect(); __ao.showCard({ agent: a }, r.right, r.bottom + 50); })()");
  await sleep(700);
  {
    const r = await inApp("(() => { const b = document.getElementById('card').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()");
    await still('card.jpg', { x: WIN.x + r.x - 300, y: WIN.y + r.y - 170, w: r.w + 340, h: r.h + 210 });
  }
  await inApp('__ao.hideCard()');
  // 6) 쉬는 에이전트 퇴근시키기
  await inApp("document.getElementById('hideBtn').click()");
  await sleep(600);
  await inApp("document.querySelector('#restList input')?.click()");
  await sleep(500);
  {
    const r = await inApp("(() => { const b = document.getElementById('restPanel').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()");
    await still('rest.jpg', { x: WIN.x + r.x - 300, y: WIN.y + r.y - 70, w: r.w + 340, h: r.h + 210 });
  }
  await inApp("document.getElementById('hideBtn').click()");
  await sleep(400);
  // 7) 1인칭
  await inApp("document.getElementById('inboxHide').click()");
  await key('KeyV');
  await sleep(900);
  await key('ArrowLeft');
  await sleep(250);
  await key('ArrowLeft', 'keyup');
  await sleep(3000);
  await still('fpv.jpg', CROP);
  await key('KeyV');
  await sleep(1200);
  await inApp("document.getElementById('inboxShow')?.click()");
  // 8) 꾸미기 (호날두 조합)
  await inApp("document.getElementById('lookBtn').click()");
  await sleep(600);
  await inApp("document.getElementById('avStar').click()");
  await sleep(1500);
  await still('character.jpg', CROP);
  await inApp("document.getElementById('avDone').click()");
  await sleep(500);
  // 9) 상단바에서 펼친 작은 창 (큰 창은 숨기고) + 펼친 보고함
  await js("S.off('win')");
  await js(`document.getElementById('mini').src = ${JSON.stringify(miniUrl)}`);
  await until(() => inMini("!!(document.getElementById('loading').classList.contains('done'))"), 15000);
  await sleep(2500);
  const tp = await js('S.trayPos()');
  const left = Math.round(Math.min(SW - 452, tp.x - 220));
  await js(`document.getElementById('pop').style.left = '${left}px'; S.on('tray'); S.on('pop')`);
  await sleep(800);
  await still('menubar.jpg', { x: SW - 760, y: 0, w: 760, h: 470 });
  await inMini("document.getElementById('inboxHide').click()");
  await js("document.getElementById('pop').style.height = '640px'");
  await sleep(1200);
  await still('menubar-open.jpg', { x: SW - 760, y: 0, w: 760, h: 700 });
  // 10) 작업실 라디오 팝업
  await js("S.on('pop', false); S.on('tray', false); S.off('win', false)");
  await sleep(500);
  await inApp("document.getElementById('musicBtn').click(); document.querySelector('#musicPanel .rst[data-st=lofi]').click()");
  await sleep(500);
  {
    const r = await inApp("(() => { const b = document.getElementById('musicPanel').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()");
    await still('music.jpg', { x: WIN.x + r.x - 260, y: WIN.y + r.y - 70, w: r.w + 300, h: r.h + 110 });
  }
  await inApp("document.getElementById('musicClose').click()");
  // 11) 카페, 축구장, 파리 맵
  await inApp("(() => { const s = document.getElementById('mapSel'); s.value = 'cafe'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await sleep(1500);
  await until(() => inApp("!!(window.__ao && __ao.agents.size >= 7 && document.getElementById('loading').classList.contains('done'))"), 20000);
  await sleep(2500);
  await still('cafe.jpg', CROP);
  for (const m of ['stadium', 'paris']) {
    await inApp(`(() => { const s = document.getElementById('mapSel'); s.value = '${m}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(1500);
    await until(() => inApp("!!(window.__ao && __ao.agents.size >= 7 && document.getElementById('loading').classList.contains('done'))"), 20000);
    await sleep(2500);
    await inApp("document.getElementById('inboxHide').click()");
    await sleep(600);
    await still(`${m}.jpg`, CROP);
    if (m !== 'paris') continue;
    // 파리는 1인칭으로 한 장 더
    await key('KeyV');
    await sleep(1600);
    await still(`${m}-eye.jpg`, CROP);
    await key('KeyV');
    await sleep(800);
  }
  // 12) 처음 설정: 시작, 앱 연결 (600x720 창을 2배로)
  const sw = new BrowserWindow({ width: 1200, height: 1440, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await sw.loadURL(`${srv.setupUrl}&step=2`);
  sw.webContents.setZoomFactor(2);
  await until(() => sw.webContents.executeJavaScript("document.querySelectorAll('.src').length === 3"));
  await sw.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  await sleep(800);
  const save = async (name) => fs.writeFileSync(path.join(OUT, name), (await sw.webContents.capturePage()).resize({ width: 900, quality: 'best' }).toJPEG(88));
  await save('setup-2.jpg');
  await sw.webContents.executeJavaScript(`document.querySelector('#steps li[data-n="1"]').click()`);
  await sleep(600);
  await save('setup-1.jpg');
  console.log('찍음: setup-1.jpg, setup-2.jpg');
  sw.destroy();
}
