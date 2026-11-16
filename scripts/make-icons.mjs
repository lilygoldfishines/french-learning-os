// Renders the app icon (« » in Newsreader on ink) to PNGs. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const font = fs.readFileSync('node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2').toString('base64');
const html = (size, rounded) => `<!doctype html><html><head><style>
@font-face{font-family:N;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}
html,body{margin:0;background:transparent}
.i{width:${size}px;height:${size}px;background:#1b1a17;border-radius:${rounded ? size * 0.225 : 0}px;display:flex;align-items:center;justify-content:center}
.g{font-family:N;font-weight:400;font-size:${size * 0.5}px;line-height:1;color:#f7f4ee;margin-top:-${size * 0.03}px}
</style></head><body><div class="i"><span class="g">«\u2009»</span></div></body></html>`;
const out = [
  ['public/icon-512.png', 512, true],
  ['public/icon-192.png', 192, true],
  ['public/icon-maskable-512.png', 512, false],
  ['public/apple-touch-icon.png', 180, false],
  ['public/favicon-32.png', 32, true],
];
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
for (const [path, size, rounded] of out) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(html(size, rounded));
  await p.evaluate(() => document.fonts.ready);
  await p.locator('.i').screenshot({ path, omitBackground: true });
  await p.close();
}
await b.close();
console.log('ok');
