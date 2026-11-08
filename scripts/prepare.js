// 포장하기 전에 방에서 쓰는 three.js 부가 모듈을 shared/three-addons로 복사한다
// (electron-builder는 의존성의 examples 폴더를 빼고 담는다)
const fs = require('node:fs');
const path = require('node:path');

const JSM = path.resolve(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm');
const OUT = path.resolve(__dirname, '..', 'shared', 'three-addons');
fs.rmSync(OUT, { recursive: true, force: true });
for (const rel of ['geometries/RoundedBoxGeometry.js', 'utils/BufferGeometryUtils.js']) {
  fs.mkdirSync(path.join(OUT, path.dirname(rel)), { recursive: true });
  fs.copyFileSync(path.join(JSM, rel), path.join(OUT, rel));
}
console.log('three.js 부가 모듈을 shared/three-addons에 담았어요');
