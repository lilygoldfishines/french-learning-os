import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:4173/#/grammar'); await p.waitForTimeout(600);
await p.getByRole('button', { name: '批量录入' }).click(); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/gb.png' });
await b.close();
