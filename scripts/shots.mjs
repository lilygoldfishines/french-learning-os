import { chromium, devices } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const seed = JSON.stringify({
  vocab: [
    { lemma: 'la scène', pos: 'noun', defEn: 'scene', defZh: '场景', cefr: 'A2', topics: ['cinema'], examples: [{ fr: 'On tourne la scène demain.', en: 'We shoot the scene tomorrow.' }] },
    { lemma: 'le cadrage', pos: 'noun', defEn: 'framing', defZh: '构图', cefr: 'B2', topics: ['cinema'] },
    { lemma: 'le repérage', pos: 'noun', defEn: 'location scouting', defZh: '勘景', cefr: 'C1', topics: ['cinema'] },
    { lemma: 'la préfecture', pos: 'noun', defEn: 'prefecture', defZh: '省政府', topics: ['admin'] },
    { lemma: 'tourner', pos: 'verb', defEn: 'to shoot (a film)', defZh: '拍摄', conjugation: '1er groupe' },
    { lemma: 'bouleversant', pos: 'adjective', defEn: 'deeply moving', defZh: '令人震撼的', cefr: 'B2' },
  ],
  expressions: [{ text: 'faire le point', defEn: 'to take stock', register: 'courant', category: 'daily' }, { text: 'ça me parle', defEn: 'it resonates with me', register: 'familier', category: 'spoken', naturalness: 'natural' }],
  errors: [
    { original: 'je suis allée à la France', corrected: 'je suis allée en France', errorType: 'preposition', grammarRef: 'en + pays féminin' },
    { original: 'la problème', corrected: 'le problème', errorType: 'gender' },
    { original: 'si j\'aurais su', corrected: 'si j\'avais su', errorType: 'conjugation', grammarRef: 'Si + plus-que-parfait' },
  ],
});
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 860 } }], ['iphone', devices['iPhone 13']]]) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/#/data');
  await p.getByLabel('粘贴 JSON').fill(seed);
  await p.getByRole('button', { name: '校验并预览' }).click();
  await p.screenshot({ path: `/tmp/${name}-import.png`, fullPage: false });
  await p.getByRole('button', { name: '确认导入' }).click();
  await p.goto('http://localhost:4173/#/plan');
  await p.getByLabel('添加本周目标').fill('完成 B1/B2 分项诊断'); await p.getByLabel('添加本周目标').press('Enter');
  await p.getByRole('button', { name: '＋ 补记一次学习' }).click();
  await p.getByRole('dialog').getByLabel('分钟').fill('75');
  await p.getByRole('dialog').getByLabel('学了什么').fill('读 Libération 影评');
  await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await p.goto('http://localhost:4173/#/assess');
  await p.getByRole('button', { name: '＋ 记录评估' }).click();
  await p.getByRole('dialog').getByRole('textbox', { name: /^证据/ }).fill('250 词短文《Pourquoi je fais des films》，Claude 评分 B1+');
  await p.getByRole('dialog').getByLabel('细分').selectOption('+');
  await p.getByRole('dialog').getByRole('button', { name: '保存评估' }).click();
  for (const [h, f] of [['/', 'dash'], ['/vocab', 'vocab'], ['/review', 'review'], ['/errors', 'errors'], ['/plan', 'plan']]) {
    await p.goto(`http://localhost:4173/#${h}`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: `/tmp/${name}-${f}.png`, fullPage: name === 'desktop' });
  }
  await ctx.close();
}
await b.close();
