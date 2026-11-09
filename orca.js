// Orca 에이전트 감시: `orca worktree ps --json`을 주기적으로 읽고,
// 상태가 바뀌는 순간(작업 중 → 끝남, 확인 필요)을 보고로 만든다.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { scanLocal, CLAUDE_DIR, CODEX_DIR } = require('./sources.js');

const CANDIDATES = ['/Applications/Orca.app/Contents/Resources/bin/orca', '/usr/local/bin/orca', '/opt/homebrew/bin/orca'];
const ORCA =
  CANDIDATES.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || 'orca';
// Finder에서 켠 앱은 셸 PATH를 못 물려받으니 흔한 경로를 붙여 준다
const ENV = { ...process.env, PATH: [process.env.PATH, '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'].filter(Boolean).join(':') };

const ACTIVE = new Set(['working', 'monitoring']);
const ATTN = new Set(['waiting', 'blocked']);
const RECENT_MS = 12 * 3600 * 1000;

function toolHint(name, input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.command || input.file_path || input.path || input.pattern || input.query || input.url || input.description || '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (input.file_path || input.path) return s.split('/').pop().slice(0, 60);
  return s.slice(0, 60);
}

function normalize(json) {
  const out = [];
  for (const w of json?.result?.worktrees || []) {
    if (w.isArchived) continue;
    const base = w.isMainWorktree || !w.displayName || w.displayName === 'main' ? w.repo || w.displayName || '작업' : w.displayName;
    const list = (w.agents || []).filter((a) => !a.parentPaneKey);
    list.forEach((a) => {
      const type = a.agentType || 'agent';
      out.push({
        id: a.paneKey,
        name: (a.displayName || a.taskTitle || base) + (list.length > 1 ? ` · ${type}` : ''),
        state: a.state || 'unknown',
        outcome: a.mainAgent?.outcome || null,
        interrupted: !!a.interrupted,
        type,
        app: 'Orca',
        prompt: String(a.prompt || '').slice(0, 800),
        message: String(a.lastAssistantMessage || ''),
        tool: a.toolName || '',
        toolHint: toolHint(a.toolName, a.toolInput),
        stateStartedAt: a.stateStartedAt || a.mainAgent?.stateStartedAt || 0,
        updatedAt: a.updatedAt || 0,
        worktree: {
          name: w.displayName || '',
          repo: w.repo || '',
          branch: String(w.branch || '').replace(/^refs\/heads\//, ''),
          path: w.path || '',
          host: w.hostId || 'local',
        },
      });
    });
  }
  return out;
}

function friendly(err, stdout) {
  try {
    const j = JSON.parse(stdout);
    if (j?.error?.message) return `Orca: ${j.error.message}`.slice(0, 160);
  } catch {}
  if (err?.code === 'ENOENT') return 'Orca CLI를 찾지 못했어요';
  if (err?.killed) return 'Orca가 너무 늦게 답해요';
  return 'Orca가 꺼져 있거나 응답하지 않아요';
}

// fixture: 스크린샷용 가짜 에이전트 (지난 시간 → 에이전트 목록). 주면 실제 기록은 읽지 않는다.
function createWatcher({ interval = 2000, onReport, onUnread, onWork, onAnswered, getSettings = () => ({}), persist, fixture } = {}) {
  const startedAt = Date.now();
  const state = { ok: false, error: null, at: 0, agents: [], reports: [], orca: ORCA, sources: { orca: false, claude: false, codex: false } };
  let prev = null;
  let busy = false;
  let lastOrca = [];
  let orcaFails = 0;
  const demos = new Map();
  let demoSeq = 0;

  const unread = () => state.reports.filter((r) => !r.read).length;
  // 보고 지문: 같은 에이전트가 같은 말로 끝낸 일은 같은 보고로 본다 (상태 시각만 다시 찍혀도 새 보고를 만들지 않게)
  // 권한 필요는 기다리기 시작한 때마다 하나. 내용은 저장하지 않고 이 짧은 지문만 읽음 표시로 남긴다
  const fpOf = (a, kind) =>
    crypto
      .createHash('sha1')
      .update(kind === 'attention' ? `${a.id}|attention|${a.stateStartedAt || 0}` : `${a.id}|${kind}|${String(a.message || '').trim()}`)
      .digest('hex')
      .slice(0, 16);
  const marks = () => {
    const s = getSettings();
    if (!s.readMarks || typeof s.readMarks !== 'object') s.readMarks = {};
    return s.readMarks;
  };
  // 읽음(r)이나 봤어요(s)를 기억한다. 오래된 것부터 500개만 남긴다
  function remember(fp, v) {
    const m = marks();
    if (m[fp] === 's' && v === 'r') return;
    delete m[fp];
    m[fp] = v;
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete m[k];
  }
  const makeReport = (a, kind, read) => withMark({
    id: `${a.id}|${a.stateStartedAt || Date.now()}|${kind}`,
    agentId: a.id,
    kind,
    name: a.name,
    type: a.type,
    app: a.app || '',
    repo: a.worktree.repo,
    branch: a.worktree.branch,
    path: a.worktree.path,
    prompt: a.prompt,
    message: a.message,
    at: a.updatedAt || Date.now(),
    read: !!read,
    seen: false, // 봤어요 처리하면 보고함 목록에서 빠지고 '본 것'으로 간다 (지우지는 않는다)
    demo: !!a.demo,
    fp: fpOf(a, kind),
  });
  // 전에 읽었거나 봤어요 한 보고면 그 상태로 만든다
  function withMark(r) {
    const mk = marks()[r.fp];
    if (mk) r.read = true;
    if (mk === 's') r.seen = true;
    return r;
  }
  function addReport(r, notify) {
    if (state.reports.some((x) => x.id === r.id || x.fp === r.fp)) return; // 같은 보고는 한 번만
    if (r.read) notify = false; // 이미 읽은 보고는 다시 알리지 않는다
    state.reports.unshift(r);
    if (state.reports.length > 200) state.reports.length = 200;
    if (notify) onReport?.(r, unread());
    else onUnread?.(unread());
  }

  function diff(list) {
    const byId = new Map(list.map((a) => [a.id, a]));
    if (!prev) {
      // 처음 읽을 때: 최근에 끝난 일은 읽은 보고로 깔아 두고, 확인이 필요한 건 알린다
      for (const a of list) {
        if ((a.state === 'done' || a.state === 'idle') && a.message && Date.now() - a.updatedAt < RECENT_MS)
          addReport(makeReport(a, a.interrupted ? 'interrupted' : 'done', true), false);
      }
      state.reports.sort((x, y) => y.at - x.at);
      for (const a of list) if (ATTN.has(a.state)) addReport(makeReport(a, 'attention', false), true);
      for (const a of list) if (ACTIVE.has(a.state)) onWork?.(a);
    } else {
      for (const a of list) {
        const p = prev.get(a.id);
        const wasBusy = p && (ACTIVE.has(p.state) || ATTN.has(p.state));
        const finishedNow =
          (a.state === 'done' || a.state === 'idle') &&
          (wasBusy || (p && p.state === a.state && p.stateStartedAt !== a.stateStartedAt) || (!p && a.stateStartedAt > startedAt));
        if (finishedNow) addReport(makeReport(a, a.interrupted ? 'interrupted' : 'done', false), true);
        if (ATTN.has(a.state) && (!p || p.state !== a.state)) addReport(makeReport(a, 'attention', false), true);
        if (ACTIVE.has(a.state) && (!p || !ACTIVE.has(p.state))) onWork?.(a);
        if (p && ATTN.has(p.state) && !ATTN.has(a.state)) {
          onAnswered?.(a, Date.now() - (p.stateStartedAt || Date.now()));
          let changed = false;
          for (const r of state.reports)
            if (r.agentId === a.id && r.kind === 'attention' && !r.read) {
              r.read = true;
              remember(r.fp, 'r');
              changed = true;
            }
          if (changed) {
            persist?.();
            onUnread?.(unread());
          }
        }
      }
    }
    prev = byId;
  }

  function demoAgents() {
    const now = Date.now();
    for (const [id, d] of demos) if (now - d.bornAt > 6 * 60 * 1000) demos.delete(id);
    return [...demos.values()].map((d) => {
      const t = now - d.bornAt;
      const a = { ...d.base, updatedAt: now };
      if (t < 4000) Object.assign(a, { state: 'working', tool: 'Read', toolHint: 'room.js', stateStartedAt: d.bornAt });
      else if (t < 9000) Object.assign(a, { state: 'working', tool: 'Edit', toolHint: 'avatar.js', stateStartedAt: d.bornAt });
      else if (t < 13000) Object.assign(a, { state: 'working', tool: 'Bash', toolHint: 'npm test', stateStartedAt: d.bornAt });
      else
        Object.assign(a, {
          state: 'done',
          outcome: 'success',
          tool: '',
          toolHint: '',
          stateStartedAt: d.bornAt + 13000,
          updatedAt: d.bornAt + 13000,
          message: '연습 보고예요! 책상에서 파일 두 개 읽고 고친 다음 테스트까지 돌려 봤어요. 실제로 바뀐 건 없으니 걱정 마세요.',
        });
      return a;
    });
  }

  function poll() {
    if (fixture) {
      const list = fixture(Date.now() - startedAt);
      state.at = Date.now();
      state.ok = true;
      state.error = null;
      state.sources = { orca: true, claude: true, codex: true };
      diff(list);
      state.agents = list;
      return;
    }
    if (busy) return;
    busy = true;
    const src = getSettings().sources || {};
    const orcaWanted = src.orca !== false;
    const run = (cb) =>
      orcaWanted
        ? execFile(ORCA, ['worktree', 'ps', '--json', '--limit', '200'], { timeout: 10000, maxBuffer: 32 * 1024 * 1024, env: ENV }, cb)
        : setImmediate(() => cb({ code: 'OFF' }, ''));
    run((err, stdout) => {
      busy = false;
      state.at = Date.now();
      let list = null;
      let orcaError = null;
      if (!err) {
        try {
          const json = JSON.parse(stdout);
          if (json.ok) list = normalize(json);
          else orcaError = friendly(null, stdout);
        } catch {
          orcaError = 'Orca 응답을 읽지 못했어요';
        }
      } else orcaError = err?.code === 'OFF' ? null : friendly(err, stdout);
      // Orca가 잠깐 답을 못 해도 바로 사라지지 않게 두 번까지는 이전 값을 쓴다
      if (list) {
        lastOrca = list;
        orcaFails = 0;
      } else orcaFails++;
      const orca = list || (orcaWanted && orcaFails < 3 ? lastOrca : []);
      if (!orcaWanted) lastOrca = [];
      let local = [];
      try {
        local = scanLocal({
          orcaPaths: new Set(orca.map((a) => a.worktree.path)),
          orcaOn: orcaWanted && (!!list || orcaFails < 3),
          claude: src.claude !== false,
          codex: src.codex !== false,
        });
      } catch {}
      state.sources = {
        orca: !!list,
        claude: src.claude !== false && fs.existsSync(CLAUDE_DIR),
        codex: src.codex !== false && fs.existsSync(CODEX_DIR),
      };
      state.error = orcaError;
      state.ok = state.sources.orca || state.sources.claude || state.sources.codex;
      const all = orca.concat(local, demoAgents());
      diff(all);
      state.agents = all;
    });
  }

  poll();
  // interval: 숫자나 함수 (함수면 매번 물어본다: 창이 열려 있으면 자주, 닫혀 있으면 가끔)
  let timer = null;
  const every = () => (typeof interval === 'function' ? interval() : interval);
  const tick = () => {
    timer = setTimeout(() => {
      poll();
      tick();
    }, every());
  };
  tick();

  return {
    state,
    unread,
    markRead(id) {
      for (const r of state.reports)
        if (id === '*' || r.id === id) {
          r.read = true;
          remember(r.fp, 'r');
        }
      persist?.();
      onUnread?.(unread());
    },
    markSeen(id, seen = true) {
      for (const r of state.reports)
        if (id === '*' || r.id === id) {
          r.seen = seen;
          if (seen) r.read = true;
          remember(r.fp, seen ? 's' : 'r');
          if (!seen) marks()[r.fp] = 'r'; // 되돌리기: 목록으로는 돌아오되 읽음은 그대로
        }
      persist?.();
      onUnread?.(unread());
    },
    startDemo() {
      const id = `demo-${++demoSeq}-${Date.now()}`;
      demos.set(id, {
        bornAt: Date.now(),
        base: {
          id,
          name: `연습 에이전트 ${demoSeq}`,
          state: 'working',
          outcome: null,
          interrupted: false,
          type: 'claude',
          prompt: '작업실 구경 좀 시켜 주고, 끝나면 보고해 줘',
          message: '',
          tool: 'Read',
          toolHint: '',
          stateStartedAt: Date.now(),
          updatedAt: Date.now(),
          demo: true,
          worktree: { name: '연습', repo: '에이전트 작업실', branch: 'demo', path: '', host: 'local' },
        },
      });
      poll();
      return id;
    },
    pollNow: () => poll(),
    orcaInfo() {
      const installed = ORCA !== 'orca';
      return {
        installed,
        enabled: (getSettings().sources || {}).orca !== false,
        ok: state.sources.orca,
        error: state.sources.orca ? null : state.error,
        agents: lastOrca.length,
        working: lastOrca.filter((a) => a.state === 'working' || a.state === 'monitoring').length,
      };
    },
    knownPath(p) {
      return !!p && state.agents.some((a) => a.worktree.path === p);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

module.exports = { createWatcher, ORCA };
