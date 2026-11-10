// 에이전트 작업실: macOS 상단바 앱 (Electron)
// 상단바 아이콘을 누르면 바로 아래에 작은 작업실이 펼쳐지고, 바깥을 누르면 접힌다.
// 크게 보고 싶으면 '크게 보기'로 큰 창을 연다. 앱은 상단바에 남아서 계속 지켜본다.
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, Notification, shell, Tray, Menu, nativeImage, screen, session, dialog } = require('electron');
const { startServer } = require('./server.js');
const { getAppIcons } = require('./appicons.js');
const updater = require('./updater.js');

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
const POP_H = { open: 640, shut: 396 }; // 작은 창 높이: 보고함을 펼쳤을 때(장면은 위쪽 띠) / 접었을 때(방을 크게)
// 상단바 아이콘의 고유 값. ⌘ 키로 끌어 옮긴 아이콘 자리를 macOS가 다음 실행에도 기억한다
const TRAY_GUID = '6c1f7f0e-3b9d-4a57-9e43-6d8a2f5b1c90';

app.setName('에이전트 작업실');
if (!app.requestSingleInstanceLock()) {
  // 이미 켜져 있으면 새로 켠 쪽은 바로 끝낸다 (먼저 켜진 앱이 창을 띄운다)
  app.quit();
  process.exit(0);
}

const RELEASES_URL = 'https://github.com/sangjun121/agent-office/releases/latest';
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
        label: '작업실 라디오',
        submenu: [
          { label: '끄기', type: 'radio', checked: !radio.on, click: () => setRadio({ on: false }) },
          { type: 'separator' },
          ...STATIONS.map(([id, label]) => ({ label, type: 'radio', checked: radio.on && radio.station === id, click: () => setRadio({ on: true, station: id }) })),
          { type: 'separator' },
          { label: '소음 가리기 함께 켜기', type: 'checkbox', checked: radio.mask, click: () => setRadio({ mask: !radio.mask }) },
        ],
      },
      {
        label: 'YouTube',
        submenu: ytOn()
          ? [
              { label: `재생 중: ${ytState().title || 'YouTube'}`.slice(0, 70), enabled: false },
              { type: 'separator' },
              { label: '보기', click: () => showWindow({ music: 'yt' }) },
              { label: '끄기', click: () => ytStop() },
            ]
          : [{ label: '링크 넣고 틀기…', click: () => showWindow({ music: 'yt' }) }],
      },
      {
        label: '맵',
        submenu: [
          ['office', '작업실'],
          ['cafe', '카페'],
          ['stadium', '축구장'],
          ['paris', '파리'],
          ['airplane', '비행기'],
          ['beach', '해변'],
        ].map(([id, label]) => ({ label, type: 'radio', checked: srv?.getSettings().map === id, click: () => srv?.setSettings({ map: id }) })),
      },
      {
        label: '쉬는 에이전트 숨기기',
        type: 'checkbox',
        checked: !!srv?.getSettings().hideResting,
        click: (i) => srv?.setSettings({ hideResting: i.checked }),
      },
      {
        label: '이름표에 직급과 하는 일 보이기',
        type: 'checkbox',
        checked: !!srv?.getSettings().tagDetail,
        click: (i) => srv?.setSettings({ tagDetail: i.checked }),
      },
      { label: '작은 창 고정하기', type: 'checkbox', checked: popPinned, click: (i) => srv?.setSettings({ pinPopover: i.checked }) },
      { type: 'separator' },
      { label: '로그인할 때 자동으로 열기', type: 'checkbox', checked: login, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
      { type: 'separator' },
      // 새 버전: 있으면 '업데이트'가 켜진다 (누르면 받아서 바꾸고 다시 켠다)
      upd.state === 'available'
        ? { label: `업데이트 (${upd.version})…`, click: () => confirmUpdate() }
        : upd.state === 'downloading' || upd.state === 'installing' || upd.state === 'restarting'
          ? { label: `업데이트하는 중… ${Math.round(upd.progress * 100)}%`, enabled: false }
          : { label: `새 버전 확인 (지금 ${app.getVersion()})`, click: () => checkFromMenu() },
      { label: '에이전트 작업실 종료', click: () => app.quit() },
    ]),
  );
}
function setUnread(n) {
  lastUnread = n;
  tray?.setTitle(n > 0 ? ` ${n}` : '');
  tray?.setToolTip(n > 0 ? `에이전트 작업실 · 안 읽은 보고 ${n}개` : '에이전트 작업실 · 오른쪽 클릭하면 메뉴');
}

// 숨긴 창은 그리지 않게 화면에 알려 준다.
// 작은 창은 숨겨도 브라우저가 그리기를 멈추지 않아서, 보이지 않는 동안에도 CPU와 GPU를 계속 쓰고 있었다
function setPaused(w, on) {
  if (w && !w.isDestroyed()) w.webContents.executeJavaScript(`window.__aoPaused = ${!!on}`).catch(() => {});
}
function pauseWhenHidden(w) {
  const sync = () => setPaused(w, !w.isVisible() || w.isMinimized());
  for (const ev of ['show', 'hide', 'minimize', 'restore']) w.on(ev, sync);
  w.webContents.on('did-finish-load', sync); // 맵을 바꿔 화면을 새로 띄운 뒤에도
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
  pauseWhenHidden(pop);
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
// ---------- 작업실 라디오: 숨은 창에서 Web Audio로 만든 음악을 튼다 (인터넷 없음, 음악 파일 없음) ----------
const STATIONS = [
  ['lofi', '로파이'],
  ['piano', '피아노'],
  ['rain', '빗소리'],
  ['focus', '집중 소음'],
  ['cabin', '비행기 안'],
];
let radioWin = null;
const radio = { on: false, station: 'lofi', volume: 0.6, mask: false }; // mask: 소음 가리기를 채널과 함께 켠다
function radioPush() {
  if (radioWin && !radioWin.isDestroyed()) radioWin.webContents.executeJavaScript(`window.radio && window.radio.set(${JSON.stringify(radio)})`).catch(() => {});
}
function radioApply() {
  if (!radio.on) {
    radioPush();
    // 소리가 다 줄어든 뒤 창을 닫아 메모리를 돌려준다
    setTimeout(() => {
      if (!radio.on && radioWin && !radioWin.isDestroyed()) radioWin.destroy();
    }, 2000);
    return;
  }
  if (radioWin && !radioWin.isDestroyed()) return radioPush();
  radioWin = new BrowserWindow({ show: false, width: 200, height: 120, webPreferences: { ...webPreferences, backgroundThrottling: false } });
  radioWin.on('closed', () => {
    radioWin = null;
  });
  radioWin.webContents.once('did-finish-load', radioPush);
  radioWin.loadURL(`http://127.0.0.1:${srv.port}/radio`);
}
function setRadio(s) {
  if (STATIONS.some(([id]) => id === s.station)) radio.station = s.station;
  if (Number.isFinite(s.volume)) radio.volume = Math.max(0, Math.min(1, s.volume));
  if (typeof s.on === 'boolean') radio.on = s.on;
  if (typeof s.mask === 'boolean') radio.mask = s.mask;
  srv?.saveRadio?.({ station: radio.station, volume: radio.volume, mask: radio.mask });
  if (radio.on && ytOn()) ytStop(); // 라디오를 켜면 YouTube는 끈다 (하나만 나오게)
  radioApply();
}

// ---------- YouTube 미니 플레이어: 링크를 넣으면 작업실 창 안 작은 칸에서 튼다 ----------
// 퍼가기 플레이어는 음반사가 막아 둔 영상을 못 틀어서, YouTube 영상 페이지를 열고 플레이어만 보이게 줄인다.
// 작업실 화면과 다른 세션(메모리에만, 앱을 끄면 쿠키도 사라진다)에서 돌고, 이 칸만 YouTube와 Google 서버에 접속할 수 있다.
// 링크를 넣고 재생을 누를 때만 접속한다.
let ytView = null;
let ytHost = null;
let ytSession = null;
const YT_HOSTS =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com|ggpht\.com|gstatic\.com|googleapis\.com|googleusercontent\.com|google\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com)$/;
const isYouTubePage = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)youtube\.com$/.test(x.hostname);
  } catch {
    return false;
  }
};
// 영상 페이지에서 플레이어만 남기고 칸에 꽉 채운다 (제목, 댓글, 추천 영상, 위쪽 막대는 숨긴다)
const YT_CSS = `
html, body { overflow: hidden !important; background: #000 !important; }
#masthead-container, ytd-masthead, tp-yt-app-drawer, ytd-mini-guide-renderer, #secondary, #below, #related, #comments, ytd-watch-metadata, #chat, #panels,
.ytp-fullscreen-button, .ytp-size-button, .ytp-miniplayer-button, .ytp-remote-button, .ytp-pip-button { display: none !important; }
/* Premium 안내 같은 팝업이 작은 칸을 덮지 않게 ('계속 시청하시겠어요?' 확인 창은 남긴다) */
ytd-popup-container tp-yt-paper-dialog:not(:has(yt-confirm-dialog-renderer)), ytd-popup-container ytd-mealbar-promo-renderer, ytd-popup-container yt-mealbar-promo-renderer,
ytd-popup-container tp-yt-iron-dropdown, tp-yt-iron-overlay-backdrop { display: none !important; }
/* 플레이어를 감싼 요소가 위치 기준이 되지 않게 (YouTube가 화면 배치를 바꿔도 칸에 꼭 맞게) */
ytd-app, ytd-app > #content, ytd-page-manager, ytd-watch-flexy, ytd-watch-grid, #columns, #primary, #primary-inner, #player, #player-container-outer,
#player-container-inner, #player-container, ytd-player, ytd-player > #container, #full-bleed-container, #player-full-bleed-container {
  transform: none !important; contain: none !important; will-change: auto !important; filter: none !important; container-type: normal !important; }
/* 불러오는 동안 보이는 회색 뼈대 화면은 숨긴다 */
#watch-page-skeleton, #home-page-skeleton, #masthead-skeleton-icons { display: none !important; }
#movie_player { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 1000 !important; background: #000 !important; }
#movie_player .html5-video-container, #movie_player video { width: 100vw !important; height: 100vh !important; left: 0 !important; top: 0 !important; }
#movie_player video { object-fit: contain !important; }
#movie_player .ytp-chrome-bottom { width: calc(100vw - 24px) !important; left: 12px !important; }
`;
// 앱 이름이 붙지 않은 보통 Chrome처럼 접속한다
const YT_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;
// 칸이 작으니 화질은 낮게: 보일 때는 360p까지, 음악 창을 접으면 144p (소리는 그대로, 컴퓨터가 덜 바빠진다)
// 영상이 바뀔 때마다 다시 맞춘다 (YouTube 플레이어의 화질 범위 설정)
const YT_QUALITY_JS = `(() => {
  if (window.__aoQualityTimer) return;
  window.__aoQ = window.__aoQ || 'medium';
  window.__aoQualityTimer = setInterval(() => {
    const p = document.getElementById('movie_player');
    if (!p || !p.setPlaybackQualityRange || !p.getVideoData) return;
    const key = (p.getVideoData() || {}).video_id + '|' + window.__aoQ;
    if (key === window.__aoQKey) return;
    window.__aoQKey = key;
    p.setPlaybackQualityRange('tiny', window.__aoQ);
  }, 2000);
})()`;
function ytQuality(visible) {
  if (ytOn()) ytView.webContents.executeJavaScript(`window.__aoQ = '${visible ? 'medium' : 'tiny'}'`).catch(() => {});
}
function getYtSession() {
  if (ytSession) return ytSession;
  ytSession = session.fromPartition('agent-office-youtube'); // 'persist:'가 없어서 앱을 끄면 쿠키도 사라진다
  ytSession.setUserAgent(YT_UA);
  ytSession.webRequest.onBeforeRequest((d, cb) => {
    let ok = d.url.startsWith('data:') || d.url.startsWith('blob:');
    try {
      const u = new URL(d.url);
      if ((u.protocol === 'https:' || u.protocol === 'wss:') && YT_HOSTS.test(u.hostname)) ok = true;
    } catch {}
    cb({ cancel: !ok });
  });
  // 카메라, 마이크, 위치, 알림 같은 권한은 모두 거절
  ytSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  ytSession.setPermissionCheckHandler(() => false);
  return ytSession;
}
function youtubeUrl({ list, v } = {}) {
  const u = new URL('https://www.youtube.com/watch');
  if (v) u.searchParams.set('v', v);
  if (list) u.searchParams.set('list', list);
  return u.href;
}
const ytOn = () => !!(ytView && !ytView.webContents.isDestroyed());
// YouTube 칸에서 바깥으로 나가는 주소는 열지 않는다 (광고 같은 스크립트가 클릭 없이 기본 브라우저를 열지 못하게)
// YouTube 주소만, 3초에 한 번까지 기본 브라우저로 연다
let ytOutsideAt = 0;
function ytOpenOutside(u) {
  let x;
  try {
    x = new URL(u);
  } catch {
    return;
  }
  if (x.protocol !== 'https:' || !/^((www|m|music)\.)?youtube\.com$|^youtu\.be$/.test(x.hostname)) return;
  if (Date.now() - ytOutsideAt < 3000) return;
  ytOutsideAt = Date.now();
  shell.openExternal(x.href);
}
function ytPlay(spec) {
  if (!ytOn()) {
    ytView = new WebContentsView({
      webPreferences: {
        session: getYtSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        autoplayPolicy: 'no-user-gesture-required',
        backgroundThrottling: false, // 칸을 접어도 계속 재생
      },
    });
    ytView.setBackgroundColor('#000000');
    ytView.setBorderRadius?.(10); // 음악 칸의 둥근 영상 자리에 맞춘다
    const wc = ytView.webContents;
    // YouTube 안에서만 옮겨 다니고, 새 창은 열지 않는다 (YouTube 주소만 기본 브라우저로)
    wc.on('will-navigate', (e, u) => {
      if (isYouTubePage(u)) return;
      e.preventDefault();
    });
    wc.setWindowOpenHandler(({ url: u }) => {
      ytOpenOutside(u);
      return { action: 'deny' };
    });
    wc.on('dom-ready', () => {
      wc.insertCSS(YT_CSS).catch(() => {});
      wc.executeJavaScript(YT_QUALITY_JS).catch(() => {});
      ytQuality(!!ytHost);
    });
    wc.on('render-process-gone', () => ytStop());
    // YouTube 페이지가 '나가시겠어요?'로 끄기를 막지 못하게
    wc.on('will-prevent-unload', (e) => e.preventDefault());
  }
  if (radio.on) setRadio({ on: false }); // 하나만 나오게: 작업실 라디오는 끈다
  ytView.webContents.loadURL(youtubeUrl(spec)).catch(() => {}); // YouTube가 주소를 바꾸며 다시 불러오면 첫 요청은 취소로 끝난다
}
// 작업실 창 안 음악 칸의 영상 자리에 겹쳐 보인다 (rect는 창 안 좌표)
function ytShow(rect) {
  if (!ytOn() || !win || win.isDestroyed()) return;
  if (ytHost !== win) {
    ytHide();
    win.contentView.addChildView(ytView);
    ytHost = win;
  }
  const z = win.webContents.getZoomFactor() || 1;
  ytView.setBounds({ x: Math.round(rect.x * z), y: Math.round(rect.y * z), width: Math.round(rect.w * z), height: Math.round(rect.h * z) });
  ytQuality(true);
}
// 칸을 접으면 화면에서만 뺀다 (소리는 계속 난다)
function ytHide() {
  if (ytView && ytHost && !ytHost.isDestroyed()) ytHost.contentView.removeChildView(ytView);
  ytHost = null;
  ytQuality(false);
}
function ytStop() {
  ytHide();
  const wc = ytOn() ? ytView.webContents : null;
  ytView = null;
  if (!wc) return;
  // 소리부터 바로 끄고, 재생을 멈춘 뒤 페이지를 닫는다
  wc.setAudioMuted(true);
  wc.executeJavaScript("document.querySelectorAll('video, audio').forEach((m) => m.pause())").catch(() => {});
  wc.close({ waitForBeforeUnload: false });
}
function ytState() {
  if (!ytOn()) return { on: false, title: '' };
  const t = ytView.webContents.getTitle().replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '');
  return { on: true, title: /^(YouTube|www\.youtube\.com.*|https?:.*)$/.test(t) ? '' : t.slice(0, 120) };
}
function ytControl(action, data) {
  if (action === 'play') return ytPlay(data);
  if (action === 'show') return ytShow(data);
  if (action === 'hide') return ytHide();
  if (action === 'stop') return ytStop();
}

// ---------- 새 버전과 업데이트 버튼 (updater.js) ----------
// 켤 때와 3시간마다 GitHub에 새 버전이 있는지만 물어본다. 있으면 업데이트 버튼이 켜지고, 누를 때만 받아서 바꾼다.
let upd = { state: 'idle', version: '', notes: [], progress: 0, error: '' }; // idle | latest | available | downloading | installing | restarting
let updInfo = null;
const updBusy = () => ['downloading', 'installing', 'restarting'].includes(upd.state);
async function updCheck(manual) {
  if (updBusy()) return upd;
  try {
    const r = await updater.check(app.getVersion());
    updInfo = r.state === 'available' ? r.info : null;
    upd = updInfo
      ? { state: 'available', version: updInfo.version, notes: updInfo.notes, progress: 0, error: '' }
      : { state: 'latest', version: '', notes: [], progress: 0, error: '' };
  } catch {
    if (manual) upd = { ...upd, error: '새 버전을 확인하지 못했어요. 인터넷 연결을 확인해 주세요' };
  }
  return upd;
}
async function updInstall() {
  if (!updInfo || updBusy()) return upd;
  if (!app.isPackaged) return (upd = { ...upd, error: '개발 중에는 업데이트하지 않아요' });
  upd = { ...upd, state: 'downloading', progress: 0, error: '' };
  try {
    await updater.install(updInfo, (p) => {
      upd.progress = p;
      if (p >= 1) upd.state = 'installing';
    });
    upd = { ...upd, state: 'restarting', progress: 1 };
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 700);
  } catch (e) {
    // 앱 위치가 잠겨 있으면(예: 다운로드 폴더에서 바로 실행) 내려받는 페이지를 연다
    const noWrite = e.code === 'NO_WRITE' || e.code === 'EPERM' || e.code === 'EACCES';
    upd = { ...upd, state: 'available', progress: 0, error: noWrite ? '앱이 스스로 바꿀 수 없는 위치예요. 내려받는 페이지를 열었어요' : '업데이트하지 못했어요. 잠시 뒤 다시 해 주세요' };
    if (noWrite) shell.openExternal(RELEASES_URL);
  }
  return upd;
}
async function confirmUpdate() {
  if (!updInfo) return;
  const r = await dialog.showMessageBox({
    type: 'info',
    message: `에이전트 작업실 ${updInfo.version}으로 업데이트할까요?`,
    detail: [...updInfo.notes.map((n) => `• ${n}`), '', `지금 ${app.getVersion()} · 앱이 잠깐 꺼졌다가 다시 켜져요.`].join('\n').trim(),
    buttons: ['업데이트', '나중에'],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) updInstall();
}
async function checkFromMenu() {
  await updCheck(true);
  if (upd.state === 'available') return confirmUpdate();
  dialog.showMessageBox({ type: 'info', message: upd.error || `최신 버전이에요 (${app.getVersion()})`, buttons: ['확인'] });
}
function updAction(action) {
  if (action === 'check') return updCheck(true);
  if (action === 'install') {
    updInstall(); // 받는 동안 기다리지 않는다 (진행률은 상태로 알린다)
    return upd;
  }
  return upd;
}

// 전체화면에서는 신호등 버튼이 사라지니, 그 자리를 비워 두지 않게 화면에 알려 준다
function syncFullScreen() {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`document.body.classList.toggle('fs', ${win.isFullScreen()})`).catch(() => {});
}

function showWindow(opts) {
  const look = opts?.look === true;
  const setup = Number(opts?.setup) || 0;
  // music: true(마지막에 보던 칸) 또는 'radio' | 'yt'
  const music = opts?.music === true ? 'last' : ['radio', 'yt'].includes(opts?.music) ? opts.music : '';
  pop?.hide();
  if (win) {
    win.show();
    win.focus();
    if (look) win.webContents.executeJavaScript('window.openLookFromMain && window.openLookFromMain()').catch(() => {});
    if (setup) win.webContents.executeJavaScript(`window.openSetupFromMain && window.openSetupFromMain(${setup})`).catch(() => {});
    if (music) win.webContents.executeJavaScript(`window.openMusicFromMain && window.openMusicFromMain(${JSON.stringify(music)})`).catch(() => {});
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
  pauseWhenHidden(win);
  win.once('ready-to-show', () => win.show());
  win.on('close', () => ytHide()); // 창을 닫아도 YouTube는 계속 (상단바 메뉴에서 끈다)
  win.on('closed', () => {
    win = null;
    updateDock();
  });
  win.on('enter-full-screen', syncFullScreen);
  win.on('leave-full-screen', syncFullScreen);
  win.webContents.on('did-finish-load', syncFullScreen);
  win.loadURL(look ? `${baseUrl}&open=look` : setup ? `${baseUrl}&open=setup&step=${setup}` : music ? `${baseUrl}&open=music&tab=${music}` : baseUrl);
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
      const plain = String(r.message || r.prompt || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/\*\*|__|~~|`|\|/g, '');
      const n = new Notification({ title, subtitle, body: plain.replace(/\s+/g, ' ').trim().slice(0, 160) });
      n.on('click', showPopover);
      n.show();
    },
    badge: setUnread,
    openWindow: showWindow,
    radio: (s) => setRadio(s),
    youtube: ytControl,
    youtubeState: ytState,
    update: updAction,
    updateState: () => ({ ...upd, current: app.getVersion() }),
    radioState: () => ({ ...radio }),
    showMenu: () => showMenu(),
  });
  baseUrl = srv.url;
  // 지난 업데이트에서 남은 예전 앱을 치우고, 조금 뒤 새 버전을 확인한다 (그 뒤로 3시간마다)
  updater.cleanup();
  setTimeout(() => updCheck(false), 20000);
  setInterval(() => updCheck(false), 3 * 3600 * 1000);
  const savedRadio = srv.getSettings().radio || {};
  if (STATIONS.some(([id]) => id === savedRadio.station)) radio.station = savedRadio.station;
  if (Number.isFinite(savedRadio.volume)) radio.volume = Math.max(0, Math.min(1, savedRadio.volume));
  radio.mask = savedRadio.mask === true;
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
