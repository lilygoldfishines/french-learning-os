import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:4173/#/expressions'); await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/nav.png', clip: { x: 0, y: 600, width: 390, height: 244 } });
await p.goto('http://localhost:4173/#/learn'); await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/nav-learn.png', clip: { x: 0, y: 700, width: 390, height: 144 } });
await b.close();
