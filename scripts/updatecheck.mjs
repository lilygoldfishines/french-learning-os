// Manual check of the foreground update: node scripts/updatecheck.mjs (needs `vite preview --port 4174`)
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage();
const ver = async () => { await p.goto('http://localhost:4174/#/settings'); return (await p.getByText(/版本/).first().innerText()); };
await p.goto('http://localhost:4174/');
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => p.reload());
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
await p.reload();
const before = await ver();
console.log('BEFORE', before);
await new Promise((r) => setTimeout(r, 61000)); // new build minute + past the 60 s throttle
execSync('npm run build', { stdio: 'ignore' });
const reloaded = p.waitForEvent('load', { timeout: 20000 });
await p.evaluate(() => { window.dispatchEvent(new Event('focus')); });
await reloaded;
await p.waitForTimeout(500);
const after = await p.getByText(/版本/).first().innerText();
console.log('AFTER ', after, before !== after ? 'UPDATED' : 'SAME');
await b.close();
