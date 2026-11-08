// 에이전트 작업실: macOS 상단바 앱 (Electron)
// 상단바 아이콘을 누르면 바로 아래에 작은 작업실이 펼쳐지고, 바깥을 누르면 접힌다.
// 크게 보고 싶으면 '크게 보기'로 큰 창을 연다. 앱은 상단바에 남아서 계속 지켜본다.
const path = require('node:path');
const { app, BrowserWindow, Notification, shell, Tray, Menu, nativeImage, screen, session } = require('electron');
const { startServer } = require('./server.js');

let tray = null;
let pop = null; // 상단바에서 펼치는 작은 창
let win = null; // 크게 보기 창
let setupWin = null; // 처음 설정 / 에이전트 연동 창
let baseUrl = '';
let setupUrl = '';
let srv = null;
let hiddenAt = 0;
let lastUnread = 0;

app.setName('에이전트 작업실');
if (!app.requestSingleInstanceLock()) app.quit();

const webPreferences = { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, autoplayPolicy: 'no-user-gesture-required' };
function openLinksOutside(w) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- 상단바 ----------
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('에이전트 작업실 · 오른쪽 클릭하면 메뉴');
  tray.on('click', togglePopover);
  tray.on('right-click', showMenu);
}
function showMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  tray.popUpContextMenu(
    Menu.buildFromTemplate([
      { label: '작업실 펼치기', click: showPopover },
      { label: '크게 보기', click: showWindow },
      { label: '에이전트 연동 설정…', click: () => showSetup(2) },
      { type: 'separator' },
      {
        label: '맵',
        submenu: [
          ['office', '작업실'],
          ['cafe', '카페'],
        ].map(([id, label]) => ({ label, type: 'radio', checked: srv?.getSettings().map === id, click: () => srv?.setSettings({ map: id }) })),
      },
      {
        label: '쉬는 에이전트 숨기기',
        type: 'checkbox',
        checked: !!srv?.getSettings().hideResting,
        click: (i) => srv?.setSettings({ hideResting: i.checked }),
      },
      { type: 'separator' },
      { label: '로그인할 때 자동으로 열기', type: 'checkbox', checked: login, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
      { type: 'separator' },
      { label: '에이전트 작업실 종료', click: () => app.quit() },
    ]),
  );
}
function setUnread(n) {
  lastUnread = n;
  tray?.setTitle(n > 0 ? ` ${n}` : '');
  tray?.setToolTip(n > 0 ? `에이전트 작업실 · 안 읽은 보고 ${n}개` : '에이전트 작업실 · 오른쪽 클릭하면 메뉴');
}

// ---------- 펼치는 창 ----------
function createPopover() {
  pop = new BrowserWindow({
    width: 440,
    height: 640,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: true,
    backgroundColor: '#16302B',
    webPreferences,
  });
  pop.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  openLinksOutside(pop);
  pop.on('blur', () => {
    if (pop.webContents.isDevToolsOpened()) return;
    pop.hide();
    hiddenAt = Date.now();
  });
  pop.loadURL(`${baseUrl}&mode=mini`);
}
function positionPopover() {
  const tb = tray.getBounds();
  const wb = pop.getBounds();
  const area = screen.getDisplayNearestPoint({ x: Math.round(tb.x), y: Math.round(tb.y) }).workArea;
  let x = Math.round(tb.x + tb.width / 2 - wb.width / 2);
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - wb.width - 8));
  const y = Math.max(area.y + 4, Math.round(tb.y + tb.height + 6));
  pop.setPosition(x, y, false);
}
function showPopover() {
  if (!pop) createPopover();
  positionPopover();
  pop.show();
  pop.focus();
}
function togglePopover() {
  // 창이 열린 채로 아이콘을 누르면 blur로 먼저 닫히니까, 방금 닫혔으면 다시 열지 않는다
  if (pop?.isVisible()) return pop.hide();
  if (Date.now() - hiddenAt < 250) return;
  showPopover();
}

// ---------- 크게 보기 창 ----------
// ---------- 처음 설정 / 에이전트 연동 창 ----------
function updateDock() {
  if (win || setupWin) app.dock?.show();
  else app.dock?.hide();
}
function showSetup(step = 1) {
  pop?.hide();
  const url = `${setupUrl}&step=${step}`;
  if (setupWin) {
    setupWin.loadURL(url);
    setupWin.show();
    setupWin.focus();
    return;
  }
  setupWin = new BrowserWindow({
    width: 600,
    height: 720,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '에이전트 작업실 시작하기',
    backgroundColor: '#16302B',
    show: false,
    webPreferences,
  });
  openLinksOutside(setupWin);
  setupWin.once('ready-to-show', () => {
    setupWin.show();
    app.focus({ steal: true });
  });
  setupWin.on('closed', () => {
    setupWin = null;
    updateDock();
  });
  setupWin.loadURL(url);
  updateDock();
}
function finishSetup() {
  setupWin?.close();
  setTimeout(showPopover, 300);
}

function showWindow() {
  pop?.hide();
  if (win) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: '에이전트 작업실',
    backgroundColor: '#16302B',
    show: false,
    webPreferences,
  });
  openLinksOutside(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
    updateDock();
  });
  win.loadURL(baseUrl);
  updateDock();
}

app.on('second-instance', showPopover);

app.whenReady().then(async () => {
  app.dock?.hide();
  srv = await startServer({
    settingsPath: path.join(app.getPath('userData'), 'settings.json'),
    openSetup: showSetup,
    onSetupDone: finishSetup,
    getLoginItem: () => app.getLoginItemSettings().openAtLogin,
    setLoginItem: (on) => {
      try {
        app.setLoginItemSettings({ openAtLogin: on });
      } catch {}
    },
    notify: (r) => {
      if (!Notification.isSupported()) return;
      const title =
        r.kind === 'attention' ? `❗ ${r.name} · 확인이 필요해요` : r.kind === 'interrupted' ? `⏸ ${r.name} · 중단됐어요` : `✅ ${r.name} · 다 했어요`;
      const n = new Notification({ title, subtitle: r.app || undefined, body: String(r.message || r.prompt || '').replace(/\s+/g, ' ').slice(0, 160) });
      n.on('click', showPopover);
      n.show();
    },
    badge: setUnread,
    openWindow: showWindow,
    showMenu: () => showMenu(),
  });
  baseUrl = srv.url;
  setupUrl = srv.setupUrl;
  // 외부 인터넷 차단: 앱 화면은 이 Mac 안의 작업실 서버(127.0.0.1)에만 접속할 수 있다
  const local = `http://127.0.0.1:${srv.port}/`;
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
    const ok = d.url.startsWith(local) || d.url.startsWith('data:') || d.url.startsWith('blob:') || d.url.startsWith('devtools:');
    cb({ cancel: !ok });
  });
  createTray();
  createPopover();
  setUnread(lastUnread);
  // 처음 켰으면 설정부터
  if (!srv.getSettings().setupDone) showSetup(1);
});

// 창을 다 닫아도 상단바에 남는다
app.on('window-all-closed', () => {});
