// 만든 .dmg 파일에도 앱 아이콘을 입힌다 (Finder에서 보이는 파일 아이콘)
// 참고: 이 아이콘은 파일의 확장 속성에 들어가서, 웹에서 내려받으면 빠질 수 있다. 열었을 때의 디스크 아이콘과 창 디자인은 그대로 보인다.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
const icon = path.join(__dirname, '..', 'build', 'icon.png');
for (const f of fs.readdirSync(dist).filter((n) => n.endsWith('.dmg'))) {
  const file = path.join(dist, f);
  const js = `ObjC.import('AppKit'); var img = $.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(icon)}); $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, ${JSON.stringify(file)}, 0);`;
  execFileSync('osascript', ['-l', 'JavaScript', '-e', js]);
  console.log('dmg 아이콘 입힘:', f);
}
