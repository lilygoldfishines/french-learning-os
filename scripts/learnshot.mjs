import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:4173/#/data');
await p.getByLabel('粘贴 JSON').fill(JSON.stringify({
  vocab: [{ lemma: 'affiche', article: "l'", gender: 'f', pos: 'noun', ipa: 'a.fiʃ', defEn: 'poster', defZh: '海报', examples: [{ fr: "Le film est encore à l'affiche." }] }],
  expressions: [{ text: 'avoir le cafard', defEn: 'to feel down', defZh: '情绪低落', register: 'familier', examples: [{ fr: "J'ai le cafard depuis la fin du tournage.", zh: '拍完以后我一直情绪低落。' }] }],
  sentences: [{ fr: 'On tourne demain à l’aube.', zh: '我们明天黎明开拍。' }],
}));
await p.getByRole('button', { name: '校验并预览' }).click();
await p.getByRole('button', { name: '确认导入' }).click();
await p.waitForTimeout(500);
await p.goto('http://localhost:4173/#/learn'); await p.waitForTimeout(500);
await p.getByRole('button', { name: '稍后再看' }).click(); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/learn.png' });
await b.close();
