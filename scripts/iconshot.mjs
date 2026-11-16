import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 760, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file:///tmp/iconprev/index.html');
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
await p.locator('body > div').screenshot({ path: '/tmp/iconprev/app-icon-options.png' });
await b.close();
