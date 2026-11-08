// 앱 아이콘 시안 세 개와 DMG 창 배경을 그린다 (앱의 3D 캐릭터를 그대로 렌더링)
// 실행: npx electron scripts/make-art.js [text|desk|wave|room]  ← 앱 아이콘으로 쓸 시안 (기본 text: 글씨만)
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');
const { startServer } = require('../server.js');

const BUILD = path.join(__dirname, '..', 'build');
const pickArg = process.argv.slice(2).find((a) => ['text', 'desk', 'wave', 'room'].includes(a)) || 'text';
const ICON_TEXT = process.env.ICON_TEXT || '작업실'; // 앱 아이콘 글씨
const TRAY_CHAR = process.env.TRAY_CHAR || '작'; // 상단바 아이콘 글자

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
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(path.join(BUILD, 'icon-text.png'), await render(win, `${base}?v=text&text=${encodeURIComponent(ICON_TEXT)}`));
  console.log('시안 저장: build/icon-text.png');
  for (const v of ['desk', 'wave', 'room']) {
    fs.writeFileSync(path.join(BUILD, `icon-${v}.png`), await render(win, `${base}?v=${v}`));
    console.log(`시안 저장: build/icon-${v}.png`);
  }
  const ASSETS = path.join(__dirname, '..', 'assets');
  for (const [size, name] of [[18, 'trayTemplate.png'], [36, 'trayTemplate@2x.png']])
    fs.writeFileSync(path.join(ASSETS, name), await render(win, `${base}?v=tray&size=${size}&ch=${encodeURIComponent(TRAY_CHAR)}`));
  console.log('상단바 아이콘 저장: assets/trayTemplate.png, trayTemplate@2x.png');
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
