// 에이전트 작업실: macOS 상단바 앱 (Electron)
// 상단바 아이콘을 누르면 바로 아래에 작은 작업실이 펼쳐지고, 바깥을 누르면 접힌다.
// 크게 보고 싶으면 '크게 보기'로 큰 창을 연다. 앱은 상단바에 남아서 계속 지켜본다.
const path = require('node:path');
const { app, BrowserWindow, Notification, shell, Tray, Menu, nativeImage, screen, session } = require('electron');
const { startServer } = require('./server.js');
const { getAppIcons } = require('./appicons.js');

let tray = null;
let pop = null; // 상단바에서 펼치는 작은 창
let win = null; // 크게 보기 창
let setupWin = null; // 처음 설정 / 에이전트 연동 창
let baseUrl = '';
let setupUrl = '';
let srv = null;
let hiddenAt = 0;
let lastUnread = 0;
let popPinned = false; // 고정하면 다른 곳을 눌러도 작은 창이 안 닫힌다
let pinPos = null; // 고정한 채 끌어서 옮겨 둔 자리
const POP_W = 440;
const POP_H = { open: 640, shut: 396 }; // 작은 창 높이: 보고함을 펼쳤을 때 / 접었을 때
// 상단바 아이콘의 고유 값. ⌘ 키로 끌어 옮긴 아이콘 자리를 macOS가 다음 실행에도 기억한다
const TRAY_GUID = '6c1f7f0e-3b9d-4a57-9e43-6d8a2f5b1c90';

app.setName('에이전트 작업실');
if (!app.requestSingleInstanceLock()) {
  // 이미 켜져 있으면 새로 켠 쪽은 바로 끝낸다 (먼저 켜진 앱이 창을 띄운다)
  app.quit();
  process.exit(0);
}

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
  tray = new Tray(img, TRAY_GUID);
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
      { label: '에이전트 연동 설정…', click: () => openSetupInApp(2) },
      { label: '튜토리얼 다시 보기', click: () => openSetupInApp(1) },
      { type: 'separator' },
      {
        label: musicWin ? '음악 끄기' : '음악 틀기…',
        click: () => (musicWin ? stopMusic() : showWindow({ music: true })),
      },
      {
        label: '맵',
        submenu: [
          ['office', '작업실'],
          ['cafe', '카페'],
          ['stadium', '축구장'],
          ['paris', '생제르맹 데프레'],
        ].map(([id, label]) => ({ label, type: 'radio', checked: srv?.getSettings().map === id, click: () => srv?.setSettings({ map: id }) })),
      },
      {
        label: '쉬는 에이전트 숨기기',
        type: 'checkbox',
        checked: !!srv?.getSettings().hideResting,
        click: (i) => srv?.setSettings({ hideResting: i.checked }),
      },
      { label: '작은 창 고정하기', type: 'checkbox', checked: popPinned, click: (i) => srv?.setSettings({ pinPopover: i.checked }) },
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
  const s = srv?.getSettings() || {};
  popPinned = !!s.pinPopover;
  pop = new BrowserWindow({
    width: POP_W,
    height: s.miniInbox ? POP_H.open : POP_H.shut,
    show: false,
    frame: false,
    resizable: false,
    movable: popPinned,
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
    if (popPinned || pop.webContents.isDevToolsOpened()) return;
    pop.hide();
    hiddenAt = Date.now();
  });
  pop.on('moved', () => {
    if (popPinned) pinPos = pop.getPosition();
  });
  pop.loadURL(`${baseUrl}&mode=mini`);
}
function positionPopover() {
  const tb = tray.getBounds();
  const wb = pop.getBounds();
  // 아이콘이 상단바에서 밀려나 자리를 알 수 없으면, 커서가 있는 화면의 오른쪽 위에 띄운다
  const known = tb.width > 0 && tb.height > 0;
  const area = screen.getDisplayNearestPoint(known ? { x: Math.round(tb.x), y: Math.round(tb.y) } : screen.getCursorScreenPoint()).workArea;
  let x = known ? Math.round(tb.x + tb.width / 2 - wb.width / 2) : area.x + area.width - wb.width;
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - wb.width - 8));
  const y = known ? Math.max(area.y + 4, Math.round(tb.y + tb.height + 6)) : area.y + 6;
  pop.setPosition(x, y, false);
}
function placePopover() {
  // 고정한 채 옮겨 둔 자리가 있으면 그 자리에 (화면 밖으로 나가지 않게)
  if (popPinned && pinPos) {
    const b = pop.getBounds();
    const area = screen.getDisplayMatching({ x: pinPos[0], y: pinPos[1], width: b.width, height: b.height }).workArea;
    const x = Math.max(area.x, Math.min(pinPos[0], area.x + area.width - b.width));
    const y = Math.max(area.y, Math.min(pinPos[1], area.y + area.height - 80));
    return pop.setPosition(x, y, false);
  }
  positionPopover();
}
function showPopover() {
  if (!pop) createPopover();
  placePopover();
  pop.show();
  pop.focus();
}
// 화면이나 상단바 메뉴에서 설정을 바꾸면 작은 창에 바로 반영한다 (고정, 보고함 펼치기)
function applyPopSettings(s) {
  const pinned = !!s.pinPopover;
  if (pinned !== popPinned) {
    popPinned = pinned;
    pinPos = null;
    if (pop) {
      pop.setMovable(pinned);
      if (!pinned && pop.isVisible()) positionPopover();
    }
  }
  if (!pop) return;
  const h = s.miniInbox ? POP_H.open : POP_H.shut;
  const b = pop.getBounds();
  if (b.height === h) return;
  const area = screen.getDisplayMatching(b).workArea;
  const y = Math.max(area.y, Math.min(b.y, area.y + area.height - h - 8));
  pop.setBounds({ x: b.x, y, width: b.width, height: h }, pop.isVisible());
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
// 처음 설정을 마친 뒤에는 새 창 대신 큰 창 안 팝업으로 연다
function openSetupInApp(step) {
  if (!srv?.getSettings().setupDone) return showSetup(step);
  showWindow({ setup: step });
}
function finishSetup() {
  setupWin?.close();
  setTimeout(showPopover, 300);
}

// look: true → 큰 창에서 캐릭터 꾸미기까지 연다, setup: 단계 → 큰 창 안 팝업으로 튜토리얼/연동 설정 (작은 창은 좁다)
// ---------- 음악 창: YouTube 재생목록 ----------
// 작업실 창과 다른 세션(메모리에만)에서 돌고, 이 창만 YouTube와 그 영상 서버에 접속할 수 있다.
let musicWin = null;
let musicSession = null;
const MUSIC_HOSTS = /(^|\.)(youtube-nocookie\.com|youtube\.com|ytimg\.com|googlevideo\.com|ggpht\.com|gstatic\.com|googleapis\.com|google\.com)$/;
function getMusicSession() {
  if (musicSession) return musicSession;
  musicSession = session.fromPartition('agent-office-music'); // 'persist:'가 없어서 앱을 끄면 쿠키도 사라진다
  const page = `http://127.0.0.1:${srv.port}/`;
  musicSession.webRequest.onBeforeRequest((d, cb) => {
    if (d.url === `${page}app/music.js` || d.url.startsWith(`${page}music?`)) return cb({ cancel: false });
    let ok = d.url.startsWith('data:') || d.url.startsWith('blob:');
    try {
      const u = new URL(d.url);
      if ((u.protocol === 'https:' || u.protocol === 'wss:') && MUSIC_HOSTS.test(u.hostname)) ok = true;
    } catch {}
    cb({ cancel: !ok });
  });
  musicSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'fullscreen'));
  musicSession.setPermissionCheckHandler((wc, perm) => perm === 'fullscreen');
  return musicSession;
}
function openMusic({ list, v } = {}) {
  const qs = new URLSearchParams();
  if (list) qs.set('list', list);
  if (v) qs.set('v', v);
  const url = `http://127.0.0.1:${srv.port}/music?${qs}`;
  if (musicWin && !musicWin.isDestroyed()) {
    musicWin.loadURL(url);
    musicWin.show();
    return;
  }
  musicWin = new BrowserWindow({
    width: 420,
    height: 266,
    minWidth: 300,
    minHeight: 190,
    title: '에이전트 작업실 음악',
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      session: getMusicSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  const page = `http://127.0.0.1:${srv.port}/music?`;
  musicWin.webContents.on('will-navigate', (e, u) => {
    if (!u.startsWith(page)) e.preventDefault();
  });
  // 플레이어의 'YouTube에서 보기'는 기본 브라우저로
  musicWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https:\/\/(www\.)?youtube\.com\//.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  musicWin.on('closed', () => {
    musicWin = null;
  });
  musicWin.once('ready-to-show', () => musicWin?.show());
  musicWin.loadURL(url);
}
function stopMusic() {
  if (musicWin && !musicWin.isDestroyed()) musicWin.close();
}

function showWindow(opts) {
  const look = opts?.look === true;
  const setup = Number(opts?.setup) || 0;
  const music = opts?.music === true;
  pop?.hide();
  if (win) {
    win.show();
    win.focus();
    if (look) win.webContents.executeJavaScript('window.openLookFromMain && window.openLookFromMain()').catch(() => {});
    if (setup) win.webContents.executeJavaScript(`window.openSetupFromMain && window.openSetupFromMain(${setup})`).catch(() => {});
    if (music) win.webContents.executeJavaScript('window.openMusicFromMain && window.openMusicFromMain()').catch(() => {});
    return;
  }
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: '에이전트 작업실',
    titleBarStyle: 'hiddenInset', // 얇은 macOS 제목 막대 없이, 신호등 버튼만 장면 위에
    trafficLightPosition: { x: 18, y: 20 },
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
  win.loadURL(look ? `${baseUrl}&open=look` : setup ? `${baseUrl}&open=setup&step=${setup}` : music ? `${baseUrl}&open=music` : baseUrl);
  updateDock();
}

app.on('second-instance', showPopover);
// 이미 켜져 있는데 Finder나 Spotlight에서 다시 열면 큰 창을 띄운다 (상단바 아이콘이 가려져 있어도 볼 수 있게)
app.on('activate', () => {
  if (!baseUrl) return;
  if (setupWin) {
    setupWin.show();
    setupWin.focus();
    return;
  }
  showWindow();
});

app.whenReady().then(async () => {
  app.dock?.hide();
  srv = await startServer({
    settingsPath: path.join(app.getPath('userData'), 'settings.json'),
    openSetup: showSetup,
    onSetupDone: finishSetup,
    onSettings: applyPopSettings,
    getAppIcons,
    isViewing: () => !!(pop?.isVisible() || win?.isVisible() || setupWin?.isVisible()),
    getLoginItem: () => app.getLoginItemSettings().openAtLogin,
    setLoginItem: (on) => {
      try {
        app.setLoginItemSettings({ openAtLogin: on });
      } catch {}
    },
    notify: (r) => {
      if (!Notification.isSupported()) return;
      const who = r.nick || r.name; // 내가 붙인 이름이 있으면 그 이름으로
      const title =
        r.kind === 'attention' ? `❗ ${who} · 권한이 필요해요` : r.kind === 'interrupted' ? `⏸ ${who} · 중단됐어요` : `✅ ${who} · 다 했어요`;
      const subtitle = [r.nick ? r.name : '', r.app].filter(Boolean).join(' · ') || undefined;
      const n = new Notification({ title, subtitle, body: String(r.message || r.prompt || '').replace(/\s+/g, ' ').slice(0, 160) });
      n.on('click', showPopover);
      n.show();
    },
    badge: setUnread,
    openWindow: showWindow,
    music: (action, spec) => (action === 'play' ? openMusic(spec) : stopMusic()),
    musicState: () => ({ on: !!(musicWin && !musicWin.isDestroyed()) }),
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
  // 로그인 자동 실행이 아니라 직접 켰으면, 어디 있는지 보이게 작은 창을 한 번 펼친다
  else if (!app.getLoginItemSettings().wasOpenedAtLogin) setTimeout(showPopover, 700);
});

// 창을 다 닫아도 상단바에 남는다
app.on('window-all-closed', () => {});
