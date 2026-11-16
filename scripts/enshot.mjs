import { chromium, devices } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const [name, opts] of [['iphone', devices['iPhone 13']], ['desktop', { viewport: { width: 1280, height: 860 } }]]) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript(() => localStorage.setItem('flos-lang', 'en'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/#/');
  await p.waitForTimeout(800);
  await p.screenshot({ path: `/tmp/en-${name}-dash.png` });
  await p.goto('http://localhost:4173/#/settings');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `/tmp/en-${name}-settings.png` });
  await ctx.close();
}
await b.close();
