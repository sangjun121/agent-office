// 릴리스할 zip으로 dist/latest.json(버전, 파일 이름, 해시, 크기, 바뀐 점)을 만들고 개발자 열쇠로 서명한다.
// 열쇠는 저장소 밖 ~/.agent-office-release/update-key.pem에 있다 (없으면 만들지 않고 넘어간다).
// 바뀐 점은 AO_NOTES 환경 변수에 줄마다 하나씩 넣는다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { signedText, verifyManifest } = require('../updater.js');
const pkg = require('../package.json');

const KEY = process.env.AO_UPDATE_KEY || path.join(os.homedir(), '.agent-office-release', 'update-key.pem');
if (!fs.existsSync(KEY)) {
  console.log(`업데이트 서명 열쇠가 없어서 latest.json은 만들지 않았어요 (${KEY})`);
  process.exit(0);
}
const file = `agent-office-${pkg.version}-arm64.zip`;
const zip = path.join(__dirname, '..', 'dist', file);
const buf = fs.readFileSync(zip);
const notes = String(process.env.AO_NOTES || '')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 12)
  .map((s) => s.slice(0, 200));
const m = { version: pkg.version, file, sha512: crypto.createHash('sha512').update(buf).digest('hex'), size: buf.length, notes };
m.sig = crypto.sign(null, Buffer.from(signedText(m)), fs.readFileSync(KEY, 'utf8')).toString('base64');
if (!verifyManifest(m)) throw new Error('앱에 넣은 공개 열쇠로 서명을 확인하지 못했어요 (열쇠 짝이 다른지 확인)');
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'latest.json'), `${JSON.stringify(m, null, 2)}\n`);
console.log(`latest.json 서명 완료: ${pkg.version} (${(buf.length / 1048576).toFixed(1)} MB)`);
