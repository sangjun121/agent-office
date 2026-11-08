// Orca 밖에서 돌린 에이전트 읽기
// - Claude Code: 터미널 claude, Claude 데스크톱의 Code 탭, IDE 확장 → ~/.claude/projects/*/<세션>.jsonl
// - Codex: Codex CLI, Codex 앱, IDE 확장 → ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
// 파일 끝부분만 읽어서 지금 일하는 중인지, 끝났는지, 마지막에 뭐라고 했는지 알아낸다.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
const CODEX_DIR = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'sessions');
const ORCA_ROOT = path.join(HOME, 'orca') + path.sep;
const RECENT_MS = 12 * 3600 * 1000;
const STALE_MS = 20 * 60 * 1000; // 이만큼 아무 기록이 없으면 일하다 멈춘 것으로 본다

const CLAUDE_APP = {
  'claude-desktop': 'Claude 데스크톱',
  cli: '터미널 Claude',
  'claude-vscode': 'VS Code Claude',
  'claude-jetbrains': 'JetBrains Claude',
  'sdk-ts': 'Claude SDK',
  'sdk-cli': 'Claude SDK',
  'sdk-py': 'Claude SDK',
};
function codexApp(originator = '', source = '') {
  const o = `${originator} ${source}`.toLowerCase();
  if (o.includes('orca')) return 'Orca';
  if (o.includes('vscode') || o.includes('code_ext')) return 'VS Code Codex';
  if (o.includes('desktop') || o.includes('app')) return 'Codex 앱';
  if (o.includes('cli') || o.includes('exec')) return '터미널 Codex';
  return 'Codex';
}

const cache = new Map(); // 파일 → { mtimeMs, size, meta, agent }

function readRange(file, start, len) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, start);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}
function parseLines(text, dropFirst) {
  const lines = text.split('\n');
  if (dropFirst) lines.shift(); // 잘린 첫 줄
  const out = [];
  for (const l of lines) {
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}
function tailLines(file, size, want) {
  for (const bytes of [1.5e6, 6e6]) {
    const start = Math.max(0, size - bytes);
    const lines = parseLines(readRange(file, start, size - start), start > 0);
    if (want(lines) || start === 0) return lines;
  }
  return [];
}
const base = (p) => (p ? path.basename(p) : '');
const ts = (v) => (v ? Date.parse(v) || 0 : 0);
function toolHint(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.command || input.cmd || input.file_path || input.path || input.pattern || input.query || input.url || input.description || '';
  const s = String(Array.isArray(v) ? v.join(' ') : v).replace(/\s+/g, ' ').trim();
  return (input.file_path || input.path ? s.split('/').pop() : s).slice(0, 60);
}

// ---------- Claude Code ----------
const textOf = (j) => {
  const c = j.message?.content;
  if (typeof c === 'string') return c;
  return (c || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
};
const isToolResult = (j) => Array.isArray(j.message?.content) && j.message.content.some((x) => x.type === 'tool_result');
const isRealPrompt = (j) => j.type === 'user' && !j.isMeta && !isToolResult(j) && !/^\s*</.test(textOf(j)) && !!textOf(j).trim();

function claudeMeta(lines, meta) {
  for (const j of lines) {
    if (j.type === 'custom-title' && j.customTitle) meta.custom = j.customTitle;
    else if (j.type === 'agent-name' && j.agentName) meta.agentName = j.agentName;
    else if (j.type === 'ai-title' && j.aiTitle) meta.ai = j.aiTitle;
    else if (j.type === 'last-prompt' && j.lastPrompt) meta.prompt = j.lastPrompt;
    if (j.cwd) meta.cwd = j.cwd;
    if (j.entrypoint) meta.entrypoint = j.entrypoint;
    if (j.gitBranch) meta.branch = j.gitBranch;
    if (j.sessionId) meta.sessionId = j.sessionId;
  }
  return meta;
}

function claudeAgent(file, st, meta) {
  const lines = tailLines(file, st.size, (ls) => ls.some((j) => j.type === 'user' || j.type === 'assistant'));
  claudeMeta(lines, meta);
  const msgs = lines.filter((j) => (j.type === 'user' || j.type === 'assistant') && !j.isSidechain);
  if (!msgs.length) return null;
  const last = msgs[msgs.length - 1];
  let state = 'working';
  let interrupted = false;
  if (last.type === 'assistant') {
    const sr = last.message?.stop_reason;
    if (sr === 'end_turn' || sr === 'stop_sequence') state = 'done';
  } else if (/\[Request interrupted/.test(textOf(last))) {
    state = 'done';
    interrupted = true;
  }
  // 마지막 사용자 입력 뒤에 나온 답변과 도구
  let tool = '';
  let hint = '';
  const texts = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const j = msgs[i];
    if (j.type === 'user') break;
    const c = Array.isArray(j.message?.content) ? j.message.content : [];
    if (!tool) {
      const tu = [...c].reverse().find((x) => x.type === 'tool_use');
      if (tu) {
        tool = tu.name || '';
        hint = toolHint(tu.input);
      }
    }
    const t = c.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
    if (t) texts.unshift(t);
  }
  const prompt = [...msgs].reverse().find(isRealPrompt);
  if (/^Name this chat\b/i.test(String(meta.prompt || (prompt ? textOf(prompt) : '')))) return null;
  let startedAt = ts(last.timestamp);
  if (state === 'working') startedAt = ts(prompt?.timestamp) || ts(msgs[0].timestamp);
  if (state === 'working' && Date.now() - st.mtimeMs > STALE_MS) state = 'idle';
  const cwd = meta.cwd || '';
  return {
    id: `claude:${meta.sessionId || base(file).replace(/\.jsonl$/, '')}`,
    name: meta.custom || meta.agentName || meta.ai || base(cwd) || 'Claude 세션',
    state,
    outcome: null,
    interrupted,
    type: 'claude',
    app: CLAUDE_APP[meta.entrypoint] || 'Claude Code',
    entrypoint: meta.entrypoint || '',
    prompt: String(meta.prompt || (prompt ? textOf(prompt) : '')).slice(0, 800),
    message: texts.join('\n').slice(0, 4000),
    tool: state === 'working' ? tool : '',
    toolHint: state === 'working' ? hint : '',
    stateStartedAt: startedAt,
    updatedAt: st.mtimeMs,
    worktree: { name: base(cwd), repo: base(cwd), branch: meta.branch || '', path: cwd, host: 'local' },
  };
}

// ---------- Codex ----------
function codexAgent(file, st, meta) {
  if (!meta.id) {
    const head = parseLines(readRange(file, 0, Math.min(st.size, 256 * 1024)), false);
    const sm = head.find((j) => j.type === 'session_meta');
    Object.assign(meta, { id: sm?.payload?.id || base(file), cwd: sm?.payload?.cwd || '', originator: sm?.payload?.originator || '', source: sm?.payload?.source || '' });
  }
  const lines = tailLines(file, st.size, (ls) => ls.some((j) => j.type === 'event_msg' && /^task_|turn_aborted/.test(j.payload?.type || '')));
  let state = null;
  let interrupted = false;
  let message = '';
  let startedAt = 0;
  let lastIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = lines[i].type === 'event_msg' ? lines[i].payload || {} : null;
    if (!p) continue;
    if (p.type === 'task_complete') {
      state = 'done';
      message = p.last_agent_message || '';
      startedAt = ts(lines[i].timestamp);
    } else if (p.type === 'turn_aborted') {
      state = 'done';
      interrupted = true;
      startedAt = ts(lines[i].timestamp);
    } else if (p.type === 'task_started') {
      state = 'working';
      startedAt = ts(lines[i].timestamp);
    } else continue;
    lastIdx = i;
    break;
  }
  if (!state) return null;
  let prompt = '';
  let tool = '';
  let hint = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const j = lines[i];
    const p = j.payload || {};
    if (j.type !== 'response_item') continue;
    if (!tool && i > lastIdx && (p.type === 'function_call' || p.type === 'custom_tool_call')) {
      tool = p.name || '';
      try {
        hint = toolHint(typeof p.arguments === 'string' ? JSON.parse(p.arguments) : p.arguments || p.input);
      } catch {
        hint = String(p.input || '').slice(0, 60);
      }
    }
    if (!prompt && p.type === 'message' && p.role === 'user') {
      const t = (p.content || []).filter((c) => c.type === 'input_text').map((c) => c.text).join('\n');
      if (t.trim() && !/^\s*</.test(t)) prompt = t;
    }
    if (prompt && (tool || state !== 'working')) break;
  }
  if (state === 'working' && Date.now() - st.mtimeMs > STALE_MS) state = 'idle';
  return {
    id: `codex:${meta.id}`,
    name: `${base(meta.cwd) || 'Codex'} · Codex`,
    state,
    outcome: null,
    interrupted,
    type: 'codex',
    app: codexApp(meta.originator, meta.source),
    originator: meta.originator,
    prompt: prompt.slice(0, 800),
    message: String(message).slice(0, 4000),
    tool: state === 'working' ? tool : '',
    toolHint: state === 'working' ? hint : '',
    stateStartedAt: startedAt,
    updatedAt: st.mtimeMs,
    worktree: { name: base(meta.cwd), repo: base(meta.cwd), branch: '', path: meta.cwd || '', host: 'local' },
  };
}

// ---------- 훑기 ----------
function visit(file, now, make) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  if (now - st.mtimeMs > RECENT_MS) return null;
  const c = cache.get(file);
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) {
    // 기록은 그대로인데 오래 조용하면 멈춘 것으로 바꾼다
    if (c.agent && c.agent.state === 'working' && now - st.mtimeMs > STALE_MS) c.agent = { ...c.agent, state: 'idle', tool: '', toolHint: '' };
    return c.agent;
  }
  const meta = c?.meta || {};
  let agent = null;
  try {
    agent = make(file, st, meta);
  } catch {}
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, meta, agent });
  return agent;
}

function scanClaude(now) {
  const out = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(CLAUDE_DIR);
  } catch {
    return out;
  }
  for (const d of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(CLAUDE_DIR, d));
    } catch {
      continue;
    }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue;
      const file = path.join(CLAUDE_DIR, d, n);
      if (!cache.has(file)) {
        // 처음 보는 파일은 앞부분에서 제목, 폴더, 실행한 앱을 읽어 둔다
        try {
          const st = fs.statSync(file);
          if (now - st.mtimeMs > RECENT_MS) continue;
          const meta = claudeMeta(parseLines(readRange(file, 0, Math.min(st.size, 512 * 1024)), false), {});
          cache.set(file, { mtimeMs: -1, size: -1, meta, agent: null });
        } catch {
          continue;
        }
      }
      const a = visit(file, now, claudeAgent);
      if (a) out.push(a);
    }
  }
  return out;
}

function scanCodex(now) {
  const out = [];
  for (const k of [0, 1]) {
    const d = new Date(now - k * 86400000);
    const dir = path.join(CODEX_DIR, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue;
      const a = visit(path.join(dir, n), now, codexAgent);
      if (a) out.push(a);
    }
  }
  return out;
}

// orcaPaths: Orca가 이미 보여 주는 폴더. Orca가 띄운 세션은 겹치지 않게 뺀다.
function scanLocal({ orcaPaths = new Set(), orcaOn = false, claude = true, codex = true } = {}) {
  const now = Date.now();
  const fromOrca = (a) => {
    const p = a.worktree.path || '';
    if (a.app === 'Orca') return orcaOn;
    if (p.startsWith(ORCA_ROOT)) return orcaOn;
    if (a.entrypoint && a.entrypoint.startsWith('sdk')) return orcaOn && orcaPaths.has(p);
    return false;
  };
  const list = [...(claude ? scanClaude(now) : []), ...(codex ? scanCodex(now) : [])].filter((a) => !fromOrca(a));
  // 오래 쌓인 끝난 세션은 최근 것만
  const busy = list.filter((a) => a.state === 'working');
  const rest = list.filter((a) => a.state !== 'working').sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 12);
  return [...busy, ...rest];
}

// 설정 화면용: 이 Mac에 Claude, Codex 기록이 있는지, 최근 7일에 어떤 앱에서 썼는지
function listFiles(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
function detectLocal() {
  const now = Date.now();
  const WEEK = 7 * 86400000;
  const tilde = (p) => p.replace(HOME, '~');
  const claude = { found: fs.existsSync(CLAUDE_DIR), dir: tilde(CLAUDE_DIR), recent: 0, apps: [] };
  const capps = new Map();
  if (claude.found) {
    const files = [];
    for (const d of listFiles(CLAUDE_DIR))
      for (const n of listFiles(path.join(CLAUDE_DIR, d))) {
        if (!n.endsWith('.jsonl')) continue;
        const file = path.join(CLAUDE_DIR, d, n);
        try {
          const st = fs.statSync(file);
          if (now - st.mtimeMs < WEEK) files.push([file, st]);
        } catch {}
      }
    claude.recent = files.length;
    files.sort((a, b) => b[1].mtimeMs - a[1].mtimeMs);
    for (const [file, st] of files.slice(0, 80)) {
      let meta = cache.get(file)?.meta;
      if (!meta?.entrypoint) {
        try {
          meta = claudeMeta(parseLines(readRange(file, 0, Math.min(st.size, 64 * 1024)), false), {});
        } catch {
          continue;
        }
      }
      const app = CLAUDE_APP[meta.entrypoint] || (meta.entrypoint ? 'Claude Code' : '');
      if (app) capps.set(app, (capps.get(app) || 0) + 1);
    }
  }
  claude.apps = [...capps.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));

  const codex = { found: fs.existsSync(CODEX_DIR), dir: tilde(CODEX_DIR), recent: 0, apps: [] };
  const xapps = new Map();
  if (codex.found)
    for (let k = 0; k < 7; k++) {
      const d = new Date(now - k * 86400000);
      const dir = path.join(CODEX_DIR, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
      for (const n of listFiles(dir)) {
        if (!n.endsWith('.jsonl')) continue;
        codex.recent++;
        try {
          const first = readRange(path.join(dir, n), 0, 64 * 1024).split('\n')[0];
          const p = JSON.parse(first).payload || {};
          const app = codexApp(p.originator, p.source);
          xapps.set(app, (xapps.get(app) || 0) + 1);
        } catch {}
      }
    }
  codex.apps = [...xapps.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  return { claude, codex };
}

module.exports = { scanLocal, detectLocal, CLAUDE_DIR, CODEX_DIR };
