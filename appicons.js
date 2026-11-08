// 이 Mac에 깔린 에이전트 앱(Orca, Claude, Codex)의 진짜 아이콘을 읽는다.
// 아이콘 파일을 앱에 담지 않고 그때그때 각 앱에서 읽어서, 인터넷도 다른 회사 로고 파일도 필요 없다.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { nativeImage } = require('electron');

const APPS = {
  orca: { id: 'com.stablyai.orca', names: ['Orca.app'] },
  claude: { id: 'com.anthropic.claudefordesktop', names: ['Claude.app'] },
  codex: { id: 'com.openai.codex', names: ['Codex.app'] },
};
const dirs = ['/Applications', path.join(os.homedir(), 'Applications')];
// 번들 ID로 찾고(이름이 달라도), 없으면 흔한 자리에서 찾는다
const byId = (id) =>
  new Promise((resolve) =>
    execFile('mdfind', [`kMDItemCFBundleIdentifier == '${id}'`], { timeout: 3000 }, (err, out) =>
      resolve(err ? '' : String(out).split('\n').find((l) => l.endsWith('.app')) || ''),
    ),
  );

let cache = null;
async function getAppIcons() {
  if (cache) return cache;
  const out = {};
  for (const [key, app] of Object.entries(APPS)) {
    let file = await byId(app.id);
    if (!file) file = dirs.flatMap((d) => app.names.map((n) => path.join(d, n))).find((f) => fs.existsSync(f)) || '';
    if (!file) continue;
    try {
      const img = await nativeImage.createThumbnailFromPath(file, { width: 96, height: 96 });
      if (!img.isEmpty()) out[key] = img.toDataURL();
    } catch {}
  }
  cache = out;
  return out;
}

module.exports = { getAppIcons };
