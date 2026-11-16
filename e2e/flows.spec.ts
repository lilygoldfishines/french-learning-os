import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path_ from 'node:path';

const isMobile = (p: Page) => (p.viewportSize()?.width ?? 1000) < 768;

async function openQuick(page: Page) {
  if (isMobile(page)) await page.getByRole('button', { name: '快速记录' }).click();
  else await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: '快速记录' })).toBeVisible();
}
async function go(page: Page, hash: string) {
  await page.goto(`./#${hash}`);
  await expect(page.locator('main')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '控制台' })).toBeVisible();
});

test('1 · dashboard separates ability / plan / activity; grammar catalogue seeded', async ({ page }) => {
  await expect(page.getByText('能力 · 经评估证明')).toBeVisible();
  await expect(page.getByText('本周 · 计划与实际活动')).toBeVisible();
  await go(page, '/grammar');
  await expect(page.getByRole('heading', { name: /^A1/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^C2/ })).toBeVisible();
});

test('2 · vocab: quick add with gender, gender required, duplicate, edit, search, delete', async ({ page }) => {
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('la scène');
  await expect(dlg.getByRole('button', { name: 'la · 阴性' })).toHaveAttribute('aria-pressed', 'true');
  await dlg.getByLabel('英文释义').fill('scene');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已记录' })).toBeVisible();

  // noun without gender is refused
  await dlg.getByLabel('法语（可以带冠词').fill('plan');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(dlg.getByText('名词必须标注阴阳性')).toBeVisible();

  // exact duplicate is refused
  await dlg.getByLabel('法语（可以带冠词').fill('la scène');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(dlg.getByText(/已存在相同词条/)).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();

  await go(page, '/vocab');
  const row = page.getByRole('button', { name: /la scène/ });
  await expect(row).toBeVisible();
  await expect(row.getByText('阴性 f.')).toBeVisible();
  await row.click();
  const ed = page.getByRole('dialog', { name: '编辑词条' });
  await ed.getByLabel('中文解释').fill('场景');
  await ed.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('搜索词汇').fill('场景');
  await expect(page.getByRole('button', { name: /la scène/ })).toBeVisible();
  await page.getByLabel('搜索词汇').fill('zzz');
  await expect(page.getByText('没有符合条件的词条')).toBeVisible();
  await page.getByLabel('搜索词汇').fill('');
  await page.getByRole('button', { name: /la scène/ }).click();
  await page.getByRole('dialog', { name: '编辑词条' }).getByRole('button', { name: '删除' }).click();
  await expect(page.getByText('还没有词汇')).toBeVisible();
});

test('3 · review: new card can be flipped and graded', async ({ page }) => {
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('le montage');
  await dlg.getByLabel('英文释义').fill('editing');
  await dlg.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await go(page, '/review');
  await expect(page.getByRole('button', { name: '点击翻面' })).toContainText('le montage');
  await page.waitForTimeout(500); // the card must stay unflipped until asked (regression: queue reload loop)
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.getByRole('button', { name: '卡片背面' })).toContainText('editing');
  await page.getByRole('button', { name: /^简单/ }).click();
  await expect(page.getByText('今天的复习完成了')).toBeVisible();
  await expect(page.getByText(/本次已复习 1/)).toBeVisible();
});

test('4 · error bank: similar errors merge; one correction does not verify', async ({ page }) => {
  for (const [o, c] of [['je vais à la France', 'je vais en France'], ['il habite à la Chine', 'il habite en Chine']]) {
    await openQuick(page);
    const dlg = page.getByRole('dialog', { name: '快速记录' });
    await dlg.getByRole('tab', { name: '错误' }).click();
    await dlg.getByLabel('我写 / 说的').fill(o);
    await dlg.getByLabel('正确的说法').fill(c);
    await dlg.getByLabel('错误类型').selectOption('preposition');
    await dlg.getByLabel('相关语法点').fill('en + pays féminin');
    await dlg.getByRole('button', { name: '保存' }).click();
    await page.getByRole('button', { name: '关闭' }).click();
  }
  await go(page, '/errors');
  await expect(page.getByText('介词 · 2 次')).toBeVisible();
  await page.getByText('je vais à la France').click();
  await page.getByRole('button', { name: '✓ 这次用对了' }).click();
  await expect(page.getByRole('dialog').getByText('练习中', { exact: true })).toBeVisible();
  await expect(page.getByText('上次出错之后用对 1 / 2 次')).toBeVisible();
});

test('5 · planner: goal, time block, manual session show on dashboard', async ({ page }) => {
  await go(page, '/plan');
  await page.getByLabel('添加本周目标').fill('读两篇 Cahiers du cinéma 影评');
  await page.getByLabel('添加本周目标').press('Enter');
  await expect(page.getByText('读两篇 Cahiers du cinéma 影评')).toBeVisible();
  await page.getByRole('button', { name: '＋ 时间块' }).first().click();
  await page.getByRole('dialog').getByLabel('分钟').fill('90');
  await page.getByRole('dialog').getByRole('button', { name: '添加' }).click();
  await expect(page.getByText('90 分钟').first()).toBeVisible();
  await page.getByRole('button', { name: '＋ 补记一次学习' }).click();
  await page.getByRole('dialog').getByLabel('分钟').fill('45');
  await page.getByRole('dialog').getByLabel('学了什么').fill('听 France Culture');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await go(page, '/');
  await expect(page.getByText('听 France Culture')).toBeVisible();
  await expect(page.getByText('读两篇 Cahiers du cinéma 影评')).toBeVisible();
});

test('6 · AI JSON import: preview, duplicate detection, confirm', async ({ page }) => {
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('la caméra');
  await dlg.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '关闭' }).click();

  await go(page, '/data');
  await page.getByLabel('粘贴 JSON').fill(JSON.stringify({
    vocab: [
      { lemma: 'la caméra', pos: 'noun' },
      { lemma: 'le cadrage', pos: 'noun', defEn: 'framing' },
      { lemma: 'repérage', pos: 'noun' },
    ],
    expressions: [{ text: 'faire le point', defEn: 'to take stock', register: 'courant' }],
  }));
  await page.getByRole('button', { name: '校验并预览' }).click();
  await expect(page.getByText('已存在 1')).toBeVisible();
  await expect(page.getByText('格式错误 1')).toBeVisible();
  await expect(page.getByText('新增 2')).toBeVisible();
  await expect(page.getByText('将写入 2 条')).toBeVisible();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByRole('status').filter({ hasText: '导入 2 条' })).toBeVisible();
  await go(page, '/vocab');
  await expect(page.getByRole('button', { name: /le cadrage/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^repérage/ })).toHaveCount(0);
});

test('7 · backup: export, restore on a fresh device, no duplicates, tamper check', async ({ page, browser }) => {
  test.skip(isMobile(page), 'file download/upload covered on desktop');
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('le plan-séquence');
  await dlg.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await go(page, '/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下载完整备份' }).click()]);
  // ASCII-only temp path: Playwright fails to attach files from paths containing '·'
  const dir = fs.mkdtempSync(path_.join(os.tmpdir(), 'flos-'));
  const path = path_.join(dir, 'backup.json');
  await dl.saveAs(path);
  const b = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(b.app).toBe('french-learning-os');
  expect(b.data.vocab).toHaveLength(1);
  await expect(page.getByText('上次备份：从未')).toHaveCount(0);

  // restore on a "new device": a fresh browser profile with an empty database
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p2 = await ctx2.newPage();
  await p2.goto('./#/vocab');
  await expect(p2.getByText('还没有词汇')).toBeVisible();
  await p2.goto('./#/settings');
  await p2.locator('input[type=file]').setInputFiles(path);
  await expect(p2.getByText('✓ 校验通过')).toBeVisible();
  await expect(p2.getByText('词汇 1 · 语法 59 · 复习卡 1')).toBeVisible();
  await p2.getByRole('button', { name: '合并（推荐）' }).click();
  await expect(p2.getByRole('status').filter({ hasText: '合并完成' })).toBeVisible();
  await p2.goto('./#/vocab');
  await expect(p2.getByRole('button', { name: /le plan-séquence/ })).toBeVisible();
  // merging the same backup again adds nothing (no duplicates)
  await p2.goto('./#/settings');
  await p2.locator('input[type=file]').setInputFiles(path);
  await p2.getByRole('button', { name: '合并（推荐）' }).click();
  await expect(p2.getByRole('status').filter({ hasText: '新增 0' })).toBeVisible();
  // a tampered file is refused
  const bad = JSON.parse(fs.readFileSync(path, 'utf8'));
  bad.data.vocab[0].lemma = 'modifié';
  const badPath = path_.join(dir, 'tampered.json');
  fs.writeFileSync(badPath, JSON.stringify(bad));
  await p2.locator('input[type=file]').setInputFiles(badPath);
  await expect(p2.getByText(/校验和不一致/)).toBeVisible();
  await ctx2.close();
});

test('8 · works offline after first visit', async ({ page, context }) => {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // let the SW take control
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '控制台' })).toBeVisible();
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('la lumière');
  await dlg.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已记录' })).toBeVisible();
  await context.setOffline(false);
});

test('9 · layout: no horizontal overflow on any main page', async ({ page }) => {
  for (const h of ['/', '/review', '/vocab', '/grammar', '/expressions', '/sentences', '/errors', '/plan', '/assess', '/data', '/settings', '/more']) {
    await go(page, h);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `overflow on ${h}`).toBeLessThanOrEqual(1);
  }
});

test('10 · study timer: start, survives reload, stop records a session', async ({ page }) => {
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByRole('tab', { name: '计时' }).click();
  await dlg.getByLabel('活动类型').selectOption('passive');
  await dlg.getByRole('button', { name: '开始计时' }).click();
  await expect(page.getByText(/学习计时中 · 0 分钟/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/学习计时中/)).toBeVisible();
  await page.getByRole('button', { name: '结束并记录' }).click();
  await expect(page.getByText(/学习计时中/)).toHaveCount(0);
  await go(page, '/');
  await expect(page.getByText('被动输入', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/· 1 分钟/)).toBeVisible();
});
