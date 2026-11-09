// 에이전트 작업실 업데이트: 새 버전이 있는지 확인하고, 사용자가 '업데이트'를 누를 때만 받아서 바꾼다.
// - 확인할 때는 GitHub 릴리스에 올린 latest.json(버전, 파일 이름, 해시, 서명)만 받는다. 다른 정보는 보내지 않는다.
// - latest.json은 개발자 Mac에만 있는 열쇠(Ed25519)로 서명되어 있다. 서명이 맞고, 받은 파일의 해시와 크기가 같을 때만 설치한다.
//   그래서 GitHub 계정이나 파일이 바뀌어도 가짜 업데이트는 설치되지 않는다. 지금보다 낮은 버전으로는 바꾸지 않는다.
// - 접속하는 곳은 github.com과 GitHub 파일 서버뿐이다.
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const REPO = 'sangjun121/agent-office';
const MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/latest.json`;
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
// 서명 확인용 공개 열쇠 (짝이 되는 비밀 열쇠는 개발자 Mac의 ~/.agent-office-release/update-key.pem에만 있다)
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAUXsyfl8w1x5ZUQEoXCzvnzfv2thu88xc0dy6zOPc+Ss=
-----END PUBLIC KEY-----`;
const HOSTS = /^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)$/;
const BUNDLE_ID = 'app.agentoffice.desktop';
const APP_NAME = 'Agent Office.app'; // zip 안의 앱 이름
const MAX_ZIP = 400 * 1024 * 1024;

// 서명하는 내용: 이 순서 그대로 JSON으로 만든다 (scripts/sign-update.js와 같아야 한다)
const signedText = (m) => JSON.stringify({ version: m.version, file: m.file, sha512: m.sha512, size: m.size, notes: m.notes });

// a가 b보다 새 버전인지 (0.3.10 > 0.3.9)
function newer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function verifyManifest(m) {
  if (!m || typeof m !== 'object') return null;
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) return null;
  if (m.file !== `agent-office-${m.version}-arm64.zip`) return null;
  if (!/^[0-9a-f]{128}$/.test(m.sha512 || '')) return null;
  if (!Number.isInteger(m.size) || m.size <= 0 || m.size > MAX_ZIP) return null;
  if (!Array.isArray(m.notes) || m.notes.length > 12 || !m.notes.every((n) => typeof n === 'string' && n.length <= 200)) return null;
  if (typeof m.sig !== 'string') return null;
  let ok = false;
  try {
    ok = crypto.verify(null, Buffer.from(signedText(m)), PUBLIC_KEY, Buffer.from(m.sig, 'base64'));
  } catch {}
  return ok ? { version: m.version, file: m.file, sha512: m.sha512, size: m.size, notes: m.notes } : null;
}

// GitHub에만 접속한다 (다른 곳으로 넘기려 하면 멈춘다)
function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error('주소가 이상해요'));
    }
    if (u.protocol !== 'https:' || !HOSTS.test(u.hostname)) return reject(new Error('허용하지 않은 주소예요'));
    const req = https.get(u, { headers: { 'user-agent': 'agent-office-updater', accept: '*/*' }, timeout: 20000 }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('주소가 너무 여러 번 바뀌어요'));
        return resolve(request(new URL(res.headers.location, u).href, redirects + 1));
      }
      if (code !== 200) {
        res.resume();
        const e = new Error(`HTTP ${code}`);
        e.status = code;
        return reject(e);
      }
      resolve(res);
    });
    req.on('timeout', () => req.destroy(new Error('시간이 너무 걸려요')));
    req.on('error', reject);
  });
}

// 새 버전 확인: { state: 'available', info } 또는 { state: 'latest' }
async function check(current) {
  let raw;
  try {
    const res = await request(MANIFEST_URL);
    const chunks = [];
    let n = 0;
    for await (const c of res) {
      n += c.length;
      if (n > 64 * 1024) throw new Error('버전 정보가 너무 커요');
      chunks.push(c);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    if (e.status === 404) return { state: 'latest' }; // 업데이트 정보가 없는 예전 릴리스
    throw e;
  }
  const info = verifyManifest(raw);
  if (!info) throw new Error('버전 정보의 서명이 맞지 않아요');
  return newer(info.version, current) ? { state: 'available', info } : { state: 'latest' };
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => execFile(cmd, args, { timeout: 180000 }, (err, out) => (err ? reject(err) : resolve(String(out).trim()))));

async function download(info, dir, onProgress) {
  const res = await request(`https://github.com/${REPO}/releases/download/v${info.version}/${info.file}`);
  const file = path.join(dir, info.file);
  const hash = crypto.createHash('sha512');
  const out = fs.createWriteStream(file, { mode: 0o600 });
  let got = 0;
  await new Promise((resolve, reject) => {
    const fail = (e) => {
      res.destroy();
      out.destroy();
      reject(e);
    };
    res.on('data', (c) => {
      got += c.length;
      if (got > info.size) return fail(new Error('받은 파일 크기가 달라요'));
      hash.update(c);
      onProgress?.(got / info.size);
    });
    res.on('error', fail);
    out.on('error', fail);
    out.on('finish', resolve);
    res.pipe(out);
  });
  if (got !== info.size || hash.digest('hex') !== info.sha512) throw new Error('받은 파일이 서명된 파일과 달라요');
  return file;
}

// 지금 실행 중인 앱 묶음 (/Applications/Agent Office.app 같은 곳)
const bundlePath = () => path.resolve(path.dirname(process.execPath), '..', '..');
function canReplace(bundle) {
  if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return false;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// 받은 zip을 풀어 확인한 뒤 지금 앱과 바꿔 끼운다 (실패하면 원래대로 되돌린다)
async function installZip(zip, info, bundle) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-unpack-'));
  try {
    await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
    const neu = path.join(dir, APP_NAME);
    const plist = path.join(neu, 'Contents', 'Info.plist');
    const id = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]);
    const ver = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]);
    if (id !== BUNDLE_ID || ver !== info.version) throw new Error('받은 앱이 에이전트 작업실이 아니거나 버전이 달라요');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', neu]);
    const stamp = Date.now();
    const staged = `${bundle}.new-${stamp}`;
    const old = `${bundle}.old-${stamp}`;
    await run('/usr/bin/ditto', [neu, staged]);
    try {
      fs.renameSync(bundle, old);
    } catch (e) {
      fs.rmSync(staged, { recursive: true, force: true });
      throw e;
    }
    try {
      fs.renameSync(staged, bundle);
    } catch (e) {
      fs.renameSync(old, bundle);
      fs.rmSync(staged, { recursive: true, force: true });
      throw e;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function install(info, onProgress) {
  const bundle = bundlePath();
  if (!canReplace(bundle)) {
    const e = new Error('이 위치에서는 앱이 스스로 바꿀 수 없어요');
    e.code = 'NO_WRITE';
    throw e;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-update-'));
  try {
    const zip = await download(info, dir, onProgress);
    await installZip(zip, info, bundle);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 지난 업데이트에서 남은 예전 앱 묶음을 지운다 (앱이 켜질 때)
function cleanup() {
  const bundle = bundlePath();
  if (!bundle.endsWith('.app')) return;
  const dir = path.dirname(bundle);
  const base = path.basename(bundle);
  try {
    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith(`${base}.old-`) || n.startsWith(`${base}.new-`)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
    }
  } catch {}
}

module.exports = { check, install, installZip, download, cleanup, verifyManifest, newer, signedText, RELEASES_URL };
