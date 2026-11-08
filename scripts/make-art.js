// 앱 아이콘 시안 세 개와 DMG 창 배경을 그린다 (앱의 3D 캐릭터를 그대로 렌더링)
// 실행: npx electron scripts/make-art.js [mascot|text|desk|wave|room]  ← 앱 아이콘으로 쓸 시안 (기본 mascot: 상단바 아이콘과 같은 캐릭터)
//       --all 을 붙이면 3D 시안(desk, wave, room)도 다시 그린다
//       npx electron scripts/make-art.js --tray  ← 상단바 아이콘만 다시 그리기
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');
const { startServer } = require('../server.js');

const BUILD = path.join(__dirname, '..', 'build');
const pickArg = process.argv.slice(2).find((a) => ['mascot', 'text', 'desk', 'wave', 'room'].includes(a)) || 'mascot';
const ICON_TEXT = process.env.ICON_TEXT || '작업실'; // 앱 아이콘 글씨
const TRAY_CHAR = process.env.TRAY_CHAR || ''; // 상단바 아이콘을 글자로 하고 싶을 때만
const TRAY_GLYPH = process.env.TRAY_GLYPH || ''; // 상단바 캐릭터 시안 (renderer/mascot.js의 TRAY: peek, face, robot, phones)
const ONLY_TRAY = process.argv.includes('--tray');

async function render(win, url) {
  await win.loadURL(url);
  for (let i = 0; i < 100; i++) {
    if ((await win.webContents.executeJavaScript('document.title')) === 'ready') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const data = await win.webContents.executeJavaScript('window.__png || ""');
  if (!data) throw new Error('그리지 못했어요: ' + url);
  return Buffer.from(data.split(',')[1], 'base64');
}

app.whenReady().then(async () => {
  const srv = await startServer({ port: 0, settingsPath: path.join(os.tmpdir(), 'agent-office-art-settings.json') });
  const base = `http://127.0.0.1:${srv.port}/app/icon.html`;
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: false, backgroundThrottling: false } });
  const ASSETS = path.join(__dirname, '..', 'assets');
  const trayQ = TRAY_CHAR ? `&ch=${encodeURIComponent(TRAY_CHAR)}` : TRAY_GLYPH ? `&glyph=${encodeURIComponent(TRAY_GLYPH)}` : '';
  for (const [size, name] of [[18, 'trayTemplate.png'], [36, 'trayTemplate@2x.png']])
    fs.writeFileSync(path.join(ASSETS, name), await render(win, `${base}?v=tray&size=${size}${trayQ}`));
  console.log('상단바 아이콘 저장: assets/trayTemplate.png, trayTemplate@2x.png');
  if (ONLY_TRAY) {
    srv.close();
    return app.quit();
  }
  fs.mkdirSync(BUILD, { recursive: true });
  // 앱 아이콘 시안: 캐릭터(기본)와 글씨는 늘, 3D 시안은 고르거나 --all일 때만
  const want = new Set(['mascot', 'text', pickArg]);
  if (process.argv.includes('--all')) for (const v of ['desk', 'wave', 'room']) want.add(v);
  for (const v of want) {
    const extra = v === 'text' ? `&text=${encodeURIComponent(ICON_TEXT)}` : '';
    fs.writeFileSync(path.join(BUILD, `icon-${v}.png`), await render(win, `${base}?v=${v}${extra}`));
    console.log(`시안 저장: build/icon-${v}.png`);
    if (v === 'mascot') {
      // 같은 그림을 파비콘과 설정 화면 로고로도 쓴다
      const svg = await win.webContents.executeJavaScript('window.__svg || ""');
      if (svg) fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'favicon.svg'), svg + '\n');
    }
  }
  fs.writeFileSync(path.join(BUILD, 'background.png'), await render(win, `${base}?v=dmgbg&s=1`));
  fs.writeFileSync(path.join(BUILD, 'background@2x.png'), await render(win, `${base}?v=dmgbg&s=2`));
  console.log('DMG 배경 저장: build/background.png, background@2x.png');

  // 고른 시안을 앱 아이콘으로 (.icns)
  fs.copyFileSync(path.join(BUILD, `icon-${pickArg}.png`), path.join(BUILD, 'icon.png'));
  const set = path.join(BUILD, 'icon.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(s), String(s), path.join(BUILD, 'icon.png'), '--out', path.join(set, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
    execFileSync('sips', ['-z', String(s * 2), String(s * 2), path.join(BUILD, 'icon.png'), '--out', path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(BUILD, 'icon.icns')]);
  console.log(`앱 아이콘: ${pickArg} 시안 → build/icon.icns`);
  srv.close();
  app.quit();
});
