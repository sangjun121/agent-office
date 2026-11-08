// README용 스크린샷: 가짜 에이전트 데이터로 실제 앱 화면을 찍는다 (내 작업 기록은 쓰지 않는다)
// 실행: npm run shots  → docs/*.jpg
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');
const { startServer } = require('../server.js');

const DOCS = path.join(__dirname, '..', 'docs');
const ZOOM = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fixture() {
  const T0 = Date.now();
  return (elapsed) => {
    const now = Date.now();
    const done = elapsed > 3000;
    const a = (o) => ({
      outcome: null,
      interrupted: false,
      tool: '',
      toolHint: '',
      message: '',
      updatedAt: now,
      stateStartedAt: T0,
      worktree: { name: o.name, repo: o.repo, branch: o.branch, path: '', host: 'local' },
      ...o,
    });
    return [
      a({ id: 'f1', name: '로그인 버그 고치기', state: 'working', type: 'claude', app: '터미널 Claude', tool: 'Edit', toolHint: 'auth.ts', prompt: '로그인하면 가끔 401이 나는 버그를 찾아서 고쳐 줘', repo: 'shop-web', branch: 'fix/login' }),
      a({ id: 'f2', name: '결제 API 정리', state: 'working', type: 'codex', app: 'Codex 앱', tool: 'shell', toolHint: 'pnpm test', prompt: '결제 API 응답 형식을 하나로 맞춰 줘', repo: 'shop-api', branch: 'refactor/payment' }),
      a({ id: 'f3', name: 'README 다듬기', state: 'blocked', type: 'claude', app: 'Orca', prompt: 'README 설치 방법을 정리해 줘', repo: 'docs', branch: 'docs/readme', message: '설치 방법 문단을 새로 쓰려고 해요. 바꿔도 될까요?' }),
      a({
        id: 'f4',
        name: '랜딩 페이지 문구',
        state: done ? 'done' : 'working',
        type: 'claude',
        app: 'Claude 데스크톱',
        tool: done ? '' : 'Write',
        toolHint: done ? '' : 'copy.md',
        prompt: '랜딩 페이지 첫 화면 문구를 세 가지 버전으로 써 줘',
        repo: 'landing',
        branch: 'main',
        outcome: done ? 'success' : null,
        stateStartedAt: done ? T0 + 3000 : T0,
        message: done ? '첫 화면 문구 세 가지를 만들었어요. 1번 "에이전트가 끝나면, 보고하러 와요"가 제일 짧고 선명해요. 버튼은 "지금 받아 보기"로 맞췄어요.' : '',
      }),
      a({ id: 'f5', name: '장바구니 테스트', state: 'working', type: 'claude', app: 'Orca', tool: 'Bash', toolHint: 'npm test', prompt: '장바구니 금액 계산 테스트를 추가해 줘', repo: 'shop-web', branch: 'test/cart' }),
      a({
        id: 'f6',
        name: '다크 모드 색 정리',
        state: 'done',
        type: 'codex',
        app: '터미널 Codex',
        prompt: '다크 모드 색 변수를 정리해 줘',
        repo: 'design-system',
        branch: 'main',
        message: '다크 모드 색 변수 12개를 정리하고, 대비가 낮던 3개를 고쳤어요.',
        updatedAt: T0 - 25 * 60000,
        stateStartedAt: T0 - 25 * 60000,
      }),
      a({ id: 'f7', name: 'DB 마이그레이션', state: 'monitoring', type: 'claude', app: '터미널 Claude', prompt: '마이그레이션이 끝날 때까지 지켜봐 줘', repo: 'shop-api', branch: 'main' }),
      a({ id: 'f8', name: '이미지 최적화', state: 'working', type: 'codex', app: 'VS Code Codex', tool: 'apply_patch', toolHint: 'images.ts', prompt: '상품 이미지 로딩을 빠르게 해 줘', repo: 'shop-web', branch: 'perf/images' }),
    ];
  };
}
const DETECT = {
  orca: { installed: true, enabled: true, ok: true, error: null, agents: 4, working: 2 },
  claude: { found: true, dir: '~/.claude/projects', recent: 18, apps: [{ name: '터미널 Claude', n: 9 }, { name: 'Claude 데스크톱', n: 6 }, { name: 'VS Code Claude', n: 3 }] },
  codex: { found: true, dir: '~/.codex/sessions', recent: 7, apps: [{ name: 'Codex 앱', n: 5 }, { name: 'VS Code Codex', n: 2 }] },
};

async function server(map) {
  const settingsPath = path.join(os.tmpdir(), `agent-office-shots-${map}.json`);
  fs.writeFileSync(settingsPath, JSON.stringify({ setupDone: true, bossName: '나', map, sound: false, notify: false }));
  return startServer({ port: 0, settingsPath, fixture: fixture(), fixtureDetect: DETECT });
}
async function until(win, expr, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
async function open(url, w, h) {
  const win = new BrowserWindow({ width: w * ZOOM, height: h * ZOOM, show: false, webPreferences: { offscreen: true, zoomFactor: ZOOM, backgroundThrottling: false } });
  win.webContents.setFrameRate(30);
  await win.loadURL(url);
  return win;
}
// README가 무겁지 않게: 가로 1600px 안쪽 JPEG로 저장
async function save(win, name, width = 1600) {
  let img = await win.webContents.capturePage();
  if (img.getSize().width > width) img = img.resize({ width, quality: 'best' });
  fs.writeFileSync(path.join(DOCS, name), img.toJPEG(88));
  console.log('찍음:', name, img.getSize());
}
const click = (win, sel) => win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(sel)})?.click()`);
const BUBBLE = "document.querySelector('.bub.report:not([hidden])')";

// 장면마다 창을 닫았다 열어도 앱이 저절로 꺼지지 않게
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(DOCS, { recursive: true });

  // 1) 작업실: 보고하러 온 장면, 보고 자세히, 캐릭터 꾸미기
  let srv = await server('office');
  let win = await open(srv.url, 1320, 840);
  await until(win, BUBBLE);
  await sleep(700);
  await save(win, 'office.jpg');
  await win.webContents.executeJavaScript("document.querySelector('#inboxList li.unread:not(.k-attention)')?.click()");
  await sleep(600);
  await save(win, 'report.jpg');
  await win.webContents.executeJavaScript("document.getElementById('rOk').click(); document.getElementById('lookBtn').click()");
  await sleep(400);
  // 밤티 캐릭터: 포니테일 + 더듬이 + 메롱 + 콧물 (매번 같은 모습으로)
  for (const [k, v] of [['hair', 'ponytail'], ['hairColor', '#5A3A2A'], ['hat', 'ahoge'], ['face', 'tongue'], ['glasses', 'snot'], ['top', 'hoodie'], ['cloth', '#FFD15C'], ['neck', 'none'], ['bag', 'none']])
    await click(win, `#avBody button[data-k="${k}"][data-v="${v}"]`);
  await sleep(1500);
  await save(win, 'character.jpg');
  win.destroy();
  srv.close();

  // 2) 카페: 큰 창, 상단바에서 펼친 작은 창
  srv = await server('cafe');
  win = await open(srv.url, 1320, 840);
  await until(win, BUBBLE);
  await sleep(700);
  await save(win, 'cafe.jpg');
  win.destroy();
  srv.close();
  srv = await server('cafe');
  win = await open(`${srv.url}&mode=mini`, 440, 640);
  await until(win, BUBBLE);
  await sleep(700);
  await save(win, 'popover.jpg');
  win.destroy();

  // 3) 처음 설정: 에이전트 연동하기
  win = await open(`${srv.setupUrl}&step=2`, 600, 720);
  await until(win, "document.querySelectorAll('.src').length === 3");
  // 화면 밖 창에서는 등장 애니메이션이 중간에 멈춰 찍힐 수 있어서 끈다
  await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  await sleep(800);
  await save(win, 'setup.jpg');
  win.destroy();
  srv.close();

  // 4) 대표 이미지: 상단바 + 펼친 작은 창 + 큰 창 (임시 HTML 파일로 합성)
  const url = (f) => 'file://' + f.split(path.sep).map(encodeURIComponent).join('/');
  const ROOT = path.join(__dirname, '..');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: P; src: url('${url(path.join(ROOT, 'renderer', 'fonts', 'PretendardVariable.woff2'))}'); font-weight: 45 920; }
    body { margin: 0; width: 1600px; height: 860px; overflow: hidden; font-family: P, -apple-system, sans-serif;
      background: radial-gradient(120% 120% at 20% 0%, #9CC9C0 0%, #3E7E70 45%, #1C3F38 100%); }
    .bar { position: absolute; inset: 0 0 auto 0; height: 34px; display: flex; align-items: center; gap: 22px; padding: 0 18px;
      background: rgba(255,255,255,.62); font-size: 14px; color: #1d1d1f; }
    .bar b { font-weight: 700; } .sp { flex: 1; }
    .tray { display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; background: rgba(0,0,0,.14); font-weight: 700; }
    .tray img { width: 18px; height: 18px; }
    .win { position: absolute; left: 60px; top: 116px; width: 1000px; border-radius: 12px; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.45); background: #16302B; }
    .tb { height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #ECE8E1; font-size: 12.5px; color: #555; }
    .tb i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; } .tb span { margin-left: 8px; }
    .win img { display: block; width: 1000px; }
    .pop { position: absolute; top: 44px; right: 150px; width: 440px; border-radius: 14px; overflow: hidden; box-shadow: 0 34px 80px rgba(0,0,0,.5); }
    .pop img { display: block; width: 440px; }
  </style></head><body>
    <div class="bar"><b>Finder</b><span>파일</span><span>편집</span><span>보기</span><span>이동</span><span>윈도우</span><span class="sp"></span>
      <span class="tray"><img src="${url(path.join(ROOT, 'assets', 'trayTemplate@2x.png'))}" alt="">2</span><span>🔋</span><span>오후 9:41</span></div>
    <div class="win"><div class="tb"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i><span>에이전트 작업실</span></div><img src="${url(path.join(DOCS, 'office.jpg'))}"></div>
    <div class="pop"><img src="${url(path.join(DOCS, 'popover.jpg'))}"></div>
  </body></html>`;
  const tmp = path.join(os.tmpdir(), 'agent-office-hero.html');
  fs.writeFileSync(tmp, html);
  const hero = new BrowserWindow({ width: 1600 * ZOOM, height: 860 * ZOOM, show: false, webPreferences: { offscreen: true, zoomFactor: ZOOM } });
  await hero.loadFile(tmp);
  await sleep(1500);
  await save(hero, 'hero.jpg', 2000);
  fs.rmSync(tmp, { force: true });
  app.quit();
});
