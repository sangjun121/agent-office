// 작업실 화면과 상태 API를 내주는 로컬 서버 (127.0.0.1에만 열린다)
// Electron이 이 서버를 켜고 창에 띄운다. `node server.js`로 켜면 브라우저에서도 볼 수 있다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const os = require('node:os');
const { createWatcher } = require('./orca.js');
const { createStaff, staffOf } = require('./staff.js');
const { detectLocal } = require('./sources.js');

// 설정: 처음 설정을 마쳤는지, 어떤 앱을 연동할지, 알림과 소리, 내 이름
const DEFAULTS = {
  setupDone: false,
  bossName: '나',
  bossLook: null,
  map: 'office',
  hideResting: false,
  sources: { orca: true, claude: true, codex: true },
  notify: true,
  sound: true,
  miniInbox: false, // 상단바에서 펼친 작은 창의 보고함을 펼쳐 둘지
  sentHome: {}, // 골라서 퇴근시킨 에이전트: id → 그때 쉬기 시작한 시각 (새 일을 받으면 다시 출근)
  staff: {}, // 직원 명부: 충성도 점수 (staff.js)
  pinPopover: false, // 작은 창을 고정해서 다른 곳을 눌러도 안 닫히게
};
const MAPS_OK = new Set(['office', 'cafe']);
function loadSettings(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...DEFAULTS, ...s, sources: { ...DEFAULTS.sources, ...(s.sources || {}) } };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

// 공통 화면 파일(방, 카페, 캐릭터, 스타일)은 shared/에 있다
const PACKED = __dirname.includes('app.asar');
const PUB = path.join(__dirname, 'shared');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
// 포장된 앱에서는 examples 폴더가 빠지므로 필요한 three.js 부가 모듈을 shared/three-addons에 담아 둔다
const ADDONS = PACKED ? path.join(__dirname, 'shared', 'three-addons') : path.join(THREE_DIR, 'examples', 'jsm');
const MAPS = [
  ['/vendor/three/examples/jsm/', ADDONS],
  ['/app/', path.join(__dirname, 'renderer')],
  ['/js/', path.join(PUB, 'js')],
  ['/css/', path.join(PUB, 'css')],
  ['/vendor/three/', THREE_DIR],
];
// 에이전트가 돌던 앱 → macOS 앱 이름 (여기 있는 것만 연다)
const OPEN_APP = {
  Orca: 'Orca',
  'Claude 데스크톱': 'Claude',
  '터미널 Claude': 'Terminal',
  'VS Code Claude': 'Visual Studio Code',
  'Claude SDK': 'Terminal',
  'Codex 앱': 'Codex',
  '터미널 Codex': 'Terminal',
  'VS Code Codex': 'Visual Studio Code',
  Codex: 'Terminal',
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function startServer({
  port = 47321,
  settingsPath = path.join(os.homedir(), '.agent-office', 'settings.json'),
  notify,
  badge,
  openWindow,
  showMenu,
  openSetup,
  onSetupDone,
  onSettings,
  getAppIcons,
  getLoginItem,
  setLoginItem,
  fixture,
  fixtureDetect,
} = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  let settings = loadSettings(settingsPath);
  const saveSettings = () => {
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch {}
  };
  if (!settings.staff || typeof settings.staff !== 'object') settings.staff = {};
  const staff = createStaff({ get: () => settings.staff, save: () => saveSettings() });
  const watcher = createWatcher({
    fixture,
    getSettings: () => settings,
    onReport: (r, unread) => {
      if (settings.notify !== false) notify?.(r);
      badge?.(unread);
      staff.onReport(r);
    },
    onUnread: (n) => badge?.(n),
    onWork: (a) => staff.onWork(a),
    onAnswered: (a, ms) => staff.onAnswered(a, ms),
  });
  const staleTimer = setInterval(() => staff.checkStale(watcher.state.reports), 10 * 60000);
  staleTimer.unref?.();
  // 보고를 읽으면 (처음 읽을 때만) 충성도
  const rewardRead = (id) => {
    for (const r of watcher.state.reports) if (!r.read && (id === '*' || r.id === id)) staff.onRead(r);
  };
  const withKey = (x) => ({ ...x, staffKey: staffOf(x)?.key || null });
  // 설정 바꾸기 (화면에서도, 상단바 메뉴에서도 쓴다)
  function applySettings(body = {}) {
    if (typeof body.bossName === 'string') settings.bossName = body.bossName.trim().slice(0, 16) || '나';
    for (const k of ['notify', 'sound', 'hideResting', 'miniInbox', 'pinPopover']) if (typeof body[k] === 'boolean') settings[k] = body[k];
    if (MAPS_OK.has(body.map)) settings.map = body.map;
    if (body.bossLook && typeof body.bossLook === 'object') {
      const look = {};
      for (const [k, v] of Object.entries(body.bossLook).slice(0, 16)) if (/^[a-zA-Z]{1,12}$/.test(k) && typeof v === 'string') look[k] = v.slice(0, 16);
      settings.bossLook = look;
    }
    if (body.sources && typeof body.sources === 'object')
      for (const k of ['orca', 'claude', 'codex']) if (typeof body.sources[k] === 'boolean') settings.sources[k] = body.sources[k];
    if (typeof body.login === 'boolean') setLoginItem?.(body.login);
    saveSettings();
    onSettings?.(settings);
    watcher.pollNow();
    return settings;
  }
  const setupInfo = () => ({
    settings,
    electron: !!setLoginItem,
    login: getLoginItem ? !!getLoginItem() : false,
    detect: fixtureDetect || { orca: watcher.orcaInfo(), ...detectLocal() },
  });

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://x');
    } catch {
      return json(res, 400, { ok: false });
    }
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) {
      if (req.headers['x-token'] !== token) return json(res, 403, { ok: false, error: 'forbidden' });
      const s = watcher.state;
      if (p === '/api/state')
        return json(res, 200, {
          ok: s.ok,
          error: s.error,
          at: s.at,
          sources: s.sources,
          settings: {
            bossName: settings.bossName,
            bossLook: settings.bossLook,
            sound: settings.sound,
            map: settings.map,
            hideResting: settings.hideResting,
            miniInbox: settings.miniInbox,
            pinPopover: settings.pinPopover,
            sentHome: settings.sentHome,
          },
          agents: s.agents.map(withKey),
          reports: s.reports.map(withKey),
          ...staff.view(),
          unread: watcher.unread(),
        });
      if (p === '/api/setup') return json(res, 200, setupInfo());
      if (p === '/api/app-icons') return json(res, 200, (await getAppIcons?.()) || {});
      if (req.method !== 'POST') return json(res, 405, { ok: false });
      const body = await readBody(req);
      if (p === '/api/read') {
        rewardRead(body.all ? '*' : String(body.id || ''));
        watcher.markRead(body.all ? '*' : String(body.id || ''));
        return json(res, 200, { ok: true, unread: watcher.unread() });
      }
      if (p === '/api/send-home') {
        const id = String(body.id || '').slice(0, 300);
        const since = Number(body.since) || 0;
        if (id) {
          const map = { ...(settings.sentHome || {}) };
          delete map[id];
          if (body.back !== true) map[id] = since; // back: 다시 부르기
          const keys = Object.keys(map);
          for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete map[k]; // 오래된 것부터 정리
          settings.sentHome = map;
          saveSettings();
        }
        return json(res, 200, { ok: !!id });
      }
      // 하트, 종이 총: 화면에서 일어난 일로 충성도를 바꾼다 (하루 횟수 제한은 staff.js)
      if (p === '/api/loyalty') {
        const a = watcher.state.agents.find((x) => x.id === String(body.id || ''));
        const ev = String(body.ev || '');
        const s2 = a && (ev === 'heart' ? staff.heart(a) : ev === 'shot' ? staff.shot(a) : null);
        return json(res, 200, { ok: !!s2 });
      }
      if (p === '/api/seen') {
        if (body.seen !== false) rewardRead(body.all ? '*' : String(body.id || ''));
        watcher.markSeen(body.all ? '*' : String(body.id || ''), body.seen !== false);
        return json(res, 200, { ok: true, unread: watcher.unread() });
      }
      if (p === '/api/demo') return json(res, 200, { ok: true, id: watcher.startDemo() });
      if (p === '/api/settings') return json(res, 200, { ok: true, settings: applySettings(body) });
      if (p === '/api/rescan') {
        watcher.pollNow();
        await new Promise((r) => setTimeout(r, 900));
        return json(res, 200, setupInfo());
      }
      if (p === '/api/setup-done') {
        settings.setupDone = true;
        saveSettings();
        onSetupDone?.();
        return json(res, 200, { ok: true });
      }
      if (p === '/api/open-setup') {
        openSetup?.(Number(body.step) || 1);
        return json(res, 200, { ok: !!openSetup });
      }
      if (p === '/api/open-window') {
        openWindow?.({ look: body.look === true, setup: Number(body.setup) || 0 });
        return json(res, 200, { ok: !!openWindow });
      }
      if (p === '/api/menu') {
        showMenu?.();
        return json(res, 200, { ok: !!showMenu });
      }
      if (p === '/api/open-app') {
        const name = OPEN_APP[String(body.app || '')];
        if (name) execFile('open', ['-a', name], () => {});
        return json(res, 200, { ok: !!name });
      }
      if (p === '/api/open-folder') {
        if (!watcher.knownPath(body.path)) return json(res, 400, { ok: false });
        execFile('open', [body.path], () => {});
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { ok: false });
    }

    if (p === '/' || p === '/index.html') return sendFile(res, path.join(__dirname, 'renderer', 'index.html'));
    if (p === '/setup') return sendFile(res, path.join(__dirname, 'renderer', 'setup.html'));
    if (p === '/favicon.svg') return sendFile(res, path.join(__dirname, 'renderer', 'favicon.svg'));
    for (const [prefix, dir] of MAPS) {
      if (!dir || !p.startsWith(prefix)) continue;
      const file = path.join(dir, path.normalize(p.slice(prefix.length)));
      if (!file.startsWith(dir + path.sep)) break;
      return sendFile(res, file);
    }
    json(res, 404, { ok: false });
  });

  return new Promise((resolve) => {
    const done = () => {
      const { port: real } = server.address();
      resolve({
        url: `http://127.0.0.1:${real}/?t=${token}`,
        setupUrl: `http://127.0.0.1:${real}/setup?t=${token}`,
        port: real,
        token,
        watcher,
        getSettings: () => settings,
        setSettings: applySettings,
        close: () => (watcher.stop(), clearInterval(staleTimer), server.close()),
      });
    };
    server.once('error', () => server.listen(0, '127.0.0.1', done)); // 포트가 차 있으면 아무 포트나
    server.listen(port, '127.0.0.1', done);
  });
}

module.exports = { startServer };

// `node server.js`: 브라우저로 보기 (알림은 macOS 알림 센터로)
if (require.main === module) {
  startServer({
    notify: (r) => {
      const title = r.kind === 'attention' ? `❗ ${r.name}` : `✅ ${r.name}`;
      const body = (r.kind === 'attention' ? '확인이 필요해요' : r.message || '다 했어요').slice(0, 120).replace(/["\\]/g, '');
      execFile('osascript', ['-e', `display notification "${body}" with title "${title.replace(/["\\]/g, '')}"`], () => {});
    },
  }).then(({ url, setupUrl, getSettings }) => {
    const target = getSettings().setupDone ? url : setupUrl;
    console.log(`\n  에이전트 작업실 → ${target}\n`);
    execFile('open', [target], () => {});
  });
}
