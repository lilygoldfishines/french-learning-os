import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path_ from 'node:path';

const isMobile = (p: Page) => (p.viewportSize()?.width ?? 1000) < 768;

async function openQuick(page: Page) {
  if (isMobile(page)) await page.getByRole('button', { name: /^(快速记录|Quick add)$/ }).click();
  else await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: /^(快速记录|Quick add)$/ })).toBeVisible();
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
  await expect(row.getByText('n. f.')).toBeVisible();
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
  // regression: every grade button must be readable (the "Good" button once rendered white-on-white)
  for (const name of ['忘了', '困难', '记得', '简单']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${name}`) });
    const [bg, fg] = await btn.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color]; });
    expect(bg, `${name} background vs text`).not.toBe(fg);
    const lum = (c: string) => { const [r, g, b] = c.match(/\d+/g)!.map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    expect(Math.abs(lum(bg) - lum(fg)), `${name} contrast`).toBeGreaterThan(90);
  }
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

test('11 · AI fill: key in settings, quick add fills gender + definitions, editor fills only blanks', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls++;
    const req = route.request();
    expect(req.headers()['anthropic-dangerous-direct-browser-access']).toBe('true');
    const word = JSON.parse(req.postData() ?? '{}').messages[0].content as string;
    const isScene = /sc[eè]ne/.test(word);
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ content: [{ type: 'tool_use', id: 't', name: 'fill_vocab_entry', input: isScene
        ? { lemma: 'scène', article: 'la', gender: 'f', pos: 'noun', plural: 'scènes', ipa: 'sɛn', defEn: 'scene; stage', defZh: '场景；舞台', examples: [{ fr: 'On tourne la scène demain.', en: 'We shoot the scene tomorrow.', zh: '我们明天拍这场戏。' }], topics: ['cinema'], cefr: 'A2' }
        : { lemma: 'cadrage', article: 'le', gender: 'm', pos: 'noun', defEn: 'framing', defZh: '构图', examples: [{ fr: 'Le cadrage est serré.', en: 'The framing is tight.', zh: '构图很紧。' }], cefr: 'B2' } }] }),
    });
  });
  await go(page, '/settings');
  await page.getByLabel('API 密钥').fill('sk-ant-test-1234');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已设置密钥（…1234）')).toBeVisible();

  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('scene');
  await dlg.getByRole('button', { name: 'AI 补全' }).click();
  await expect(dlg.getByLabel('法语（可以带冠词')).toHaveValue('la scène');
  await expect(dlg.getByRole('button', { name: 'la · 阴性' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dlg.getByLabel('英文释义')).toHaveValue('scene; stage');
  await expect(dlg.getByLabel('AI 补全结果')).toContainText('场景；舞台');
  await dlg.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await go(page, '/vocab');
  await page.getByRole('button', { name: /la scène/ }).click();
  const ed = page.getByRole('dialog', { name: '编辑词条' });
  await expect(ed.getByLabel('中文解释')).toHaveValue('场景；舞台');
  await expect(ed.getByLabel('IPA 音标')).toHaveValue('sɛn');
  await page.getByRole('button', { name: '关闭' }).click();

  // a word added without AI, then filled from the editor: learner's own definition survives
  await page.getByRole('button', { name: '＋ 新词' }).click();
  const ne = page.getByRole('dialog', { name: '新词' });
  await ne.getByLabel('法语词条').fill('cadrage');
  await ne.getByRole('button', { name: 'le · 阳性' }).click();
  await ne.getByLabel('英文释义').fill('my framing');
  await ne.getByRole('button', { name: 'AI 补全' }).click();
  await expect(ne.getByLabel('中文解释')).toHaveValue('构图');
  await expect(ne.getByLabel('英文释义')).toHaveValue('my framing');
  expect(calls).toBe(2);
});

test('12 · AI fill is hidden without a key', async ({ page }) => {
  await openQuick(page);
  await expect(page.getByRole('dialog', { name: '快速记录' }).getByRole('button', { name: 'AI 补全' })).toHaveCount(0);
});

test('13 · conjugation: lookup, practice right / wrong, accent keys, wrong answer goes to the error bank', async ({ page }) => {
  await go(page, '/conjugation?v=prendre');
  await expect(page.getByText('p.p. pris')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('prennent').first()).toBeVisible();
  await expect(page.getByText('第三组（不规则）')).toBeVisible();

  // practise only être · présent so answers are predictable
  for (const t of ['复合过去时', '未完成过去时', '简单将来时']) await page.getByRole('button', { name: t, exact: true }).click();
  await page.getByLabel('添加一个动词').fill('être');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '新增 1 张变位卡' })).toBeVisible();
  await go(page, '/');
  await page.getByText('动词变位待练').click();
  const forms: Record<string, string> = { je: 'je suis', tu: 'tu es', 'il/elle': 'il est', nous: 'nous sommes', vous: 'vous êtes', 'ils/elles': 'ils sont' };
  const personNow = async () => { await expect(page.getByLabel('变位答案')).toHaveValue(''); return (await page.locator('[data-person]').getAttribute('data-person')) ?? ''; };

  let p = await personNow();
  await page.getByLabel('变位答案').fill(forms[p]);
  await page.getByRole('button', { name: '检查' }).click();
  await expect(page.getByRole('status').filter({ hasText: '正确' })).toBeVisible();
  await page.getByRole('button', { name: '下一个' }).click();

  // the same card comes back in learning; give a wrong answer and log it
  await expect(page.getByLabel('变位答案')).toBeVisible();
  p = await personNow();
  await page.getByLabel('变位答案').fill('xyz');
  await page.getByRole('button', { name: '检查' }).click();
  await expect(page.getByRole('status').filter({ hasText: '不对' })).toBeVisible();
  await page.getByRole('button', { name: '记入错误库' }).click();
  await expect(page.getByRole('button', { name: '已记入错误库' })).toBeVisible();
  await page.getByRole('button', { name: '下一个' }).click();

  // accent key row inserts characters; missing accent is "accent", not wrong
  p = await personNow();
  if (p === 'vous') {
    await page.getByLabel('变位答案').fill('vous ');
    await page.getByRole('button', { name: 'ê', exact: true }).click();
    await page.getByLabel('变位答案').press('End');
    await page.getByLabel('变位答案').pressSequentially('tes');
    await expect(page.getByLabel('变位答案')).toHaveValue('vous êtes');
  } else {
    await page.getByLabel('变位答案').fill(p === 'nous' ? 'nous sommes' : forms[p]);
  }
  await page.getByRole('button', { name: '检查' }).click();
  await expect(page.getByRole('status').filter({ hasText: '正确' })).toBeVisible();

  await go(page, '/errors');
  await expect(page.getByText('动词变位 · 1 次')).toBeVisible();
});

test('14 · English interface: switch language, no Chinese left on any page, switch back', async ({ page }) => {
  await go(page, '/settings');
  await page.getByRole('main').getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Settings & backup' })).toBeVisible();
  const CJK = /[㐀-鿿]/;
  // seed one word with a Chinese definition: user content may stay Chinese, interface text may not
  for (const h of ['/', '/review', '/vocab', '/grammar', '/expressions', '/sentences', '/errors', '/conjugation', '/plan', '/assess', '/data', '/settings', '/more']) {
    await go(page, h);
    await page.waitForTimeout(h === '/conjugation' ? 1500 : 200);
    const text = await page.evaluate(() => document.body.innerText);
    const lines = text.split('\n').filter((l) => /[㐀-鿿]/.test(l) && !/^(中文|界面语言|只改变界面文字)/.test(l));
    expect(lines, `Chinese left on ${h}`).toEqual([]);
    expect(CJK.test(await page.title())).toBe(false);
  }
  await openQuick(page);
  await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await go(page, '/settings');
  await page.getByRole('main').getByRole('button', { name: '中文' }).click();
  await expect(page.getByRole('heading', { name: '设置与备份' })).toBeVisible();
});

test('15 · cloud sync between two devices (stand-in server, real client library)', async ({ browser, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough: two browser profiles play the two devices');
  type Row = { tbl: string; id: string; data: Record<string, unknown>; deleted: boolean; version: number; server_updated_at: string };
  const rows = new Map<string, Row>();
  let clock = Date.parse('2026-11-17T00:00:00Z');
  const user = { id: '9a8b7c6d-0000-4000-8000-000000000001', email: 'ines@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' };
  const wire = async (p: typeof page) => {
    await p.route('https://rloipmnxjahndadimroe.supabase.co/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.pathname === '/auth/v1/token') {
        const b = req.postDataJSON();
        if (b.password !== 'secret123') return json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
        return json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user });
      }
      if (url.pathname === '/rest/v1/rpc/sync_push') {
        const { items } = req.postDataJSON();
        return json(items.map((it: Row & { base: number | null }) => {
          const k = `${it.tbl}|${it.id}`, cur = rows.get(k);
          let version: number | null = null;
          if (it.base === null) { if (!cur) { version = 1; rows.set(k, { tbl: it.tbl, id: it.id, data: it.data, deleted: it.deleted, version, server_updated_at: new Date(clock += 1000).toISOString() }); } }
          else if (cur && cur.version === it.base) { version = cur.version + 1; rows.set(k, { ...cur, data: it.data, deleted: it.deleted, version, server_updated_at: new Date(clock += 1000).toISOString() }); }
          return { tbl: it.tbl, id: it.id, version };
        }));
      }
      if (url.pathname === '/rest/v1/records') {
        const gt = url.searchParams.get('server_updated_at')?.replace('gt.', '');
        const tbl = url.searchParams.get('tbl')?.replace('eq.', ''), id = url.searchParams.get('id')?.replace('eq.', '');
        let list = [...rows.values()];
        if (gt) list = list.filter((r) => r.server_updated_at > gt);
        if (tbl) list = list.filter((r) => r.tbl === tbl && r.id === id);
        list.sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at));
        return json(list.slice(0, Number(url.searchParams.get('limit') ?? 1000)));
      }
      return json({});
    });
  };
  const signIn = async (p: typeof page) => {
    await p.goto('./#/settings');
    await p.getByLabel('邮箱').fill(user.email);
    await p.getByLabel('密码（至少 6 位）').fill('secret123');
    await p.getByRole('button', { name: '登录', exact: true }).click();
    await expect(p.getByText(`已登录：${user.email}`)).toBeVisible();
    await expect(p.getByText(/上次同步：刚刚/)).toBeVisible();
  };

  // device A = this page; device B = a fresh profile
  await wire(page);
  await openQuick(page);
  const dlg = page.getByRole('dialog', { name: '快速记录' });
  await dlg.getByLabel('法语（可以带冠词').fill('la scène');
  await dlg.getByLabel('英文释义').fill('scene');
  await dlg.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await signIn(page);
  expect([...rows.keys()].filter((k) => k.startsWith('vocab|'))).toHaveLength(1);
  expect([...rows.keys()].filter((k) => k.startsWith('grammar|'))).toHaveLength(59);

  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const b = await ctxB.newPage();
  b.on('dialog', (d) => d.accept());
  await wire(b);
  await signIn(b);
  await b.goto('./#/vocab');
  await expect(b.getByRole('button', { name: /la scène/ })).toBeVisible();
  await b.goto('./#/grammar');
  await expect(b.getByRole('heading', { name: /^A1 · 0\/10/ })).toBeVisible(); // 10 A1 seeds, not 20

  // edit the same word on both devices → conflict shown on the second device to sync
  for (const [p, txt] of [[page, 'scene (A)'], [b, 'scene (B)']] as const) {
    await p.goto('./#/vocab');
    await p.getByRole('button', { name: /la scène/ }).click();
    await p.getByRole('dialog', { name: '编辑词条' }).getByLabel('英文释义').fill(txt);
    await p.getByRole('dialog', { name: '编辑词条' }).getByRole('button', { name: '保存', exact: true }).click();
  }
  for (const p of [page, b]) { await p.goto('./#/settings'); await p.getByRole('button', { name: '立即同步' }).click(); await expect(p.getByRole('button', { name: '立即同步' })).toBeEnabled(); }
  await expect(b.getByText('条记录在两台设备上都改过，请选择保留哪个版本')).toBeVisible();
  await expect(b.getByRole('cell', { name: 'scene (A)' })).toBeVisible();
  await b.getByRole('button', { name: '保留这台设备的' }).click();
  await b.getByRole('button', { name: '立即同步' }).click();
  await expect(b.getByText('条记录在两台设备上都改过')).toHaveCount(0);
  await page.getByRole('button', { name: '立即同步' }).click();
  await page.goto('./#/vocab');
  await expect(page.getByText('scene (B)')).toBeVisible();
  await ctxB.close();
});

test('16 · sign-in: wrong password explained; forgot password → email link → set new password', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'auth flow checked once');
  const user = { id: '9a8b7c6d-0000-4000-8000-000000000002', email: 'ines@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' };
  const calls: string[] = [];
  await page.route('https://rloipmnxjahndadimroe.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    calls.push(`${req.method()} ${url.pathname}`);
    if (url.pathname === '/auth/v1/token') return json({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    if (url.pathname === '/auth/v1/recover') return json({});
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/rest/v1/')) return json(url.pathname.includes('rpc') ? [] : []);
    return json({});
  });
  await go(page, '/settings');
  await page.getByLabel('邮箱').fill(user.email);
  await page.getByLabel('密码（至少 6 位）').fill('wrongpass');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText(/邮箱或密码不对/)).toBeVisible();
  await page.getByRole('button', { name: '忘记密码' }).click();
  await expect(page.getByText(/重设密码的邮件已发出/)).toBeVisible();
  expect(calls).toContain('POST /auth/v1/recover');

  // the email link opens the app with a recovery session in the URL
  await page.goto(`./#access_token=tok&expires_at=${Math.floor(Date.now() / 1000) + 3600}&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`);
  await expect(page.getByText('请设置一个新密码。')).toBeVisible();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.getByLabel('新密码（至少 6 位）').fill('newsecret1');
  await page.getByRole('button', { name: '保存新密码' }).click();
  await expect(page.getByText(`已登录：${user.email}`)).toBeVisible();
  expect(calls).toContain('PUT /auth/v1/user');
});

test('17 · daily new-card limit: waiting cards are explained and "learn more today" releases them', async ({ page }) => {
  await go(page, '/settings');
  await page.getByLabel('每天新卡上限').fill('1');
  await go(page, '/'); // leave the field: the N shortcut is ignored while typing in a box
  for (const w of ['le plan', 'la prise']) {
    await openQuick(page);
    const dlg = page.getByRole('dialog', { name: '快速记录' });
    await dlg.getByLabel('法语（可以带冠词').fill(w);
    await dlg.getByRole('button', { name: '保存' }).click();
    await page.getByRole('button', { name: '关闭' }).click();
  }
  await go(page, '/review');
  await page.getByRole('button', { name: '显示答案' }).click();
  await page.getByRole('button', { name: /^简单/ }).click();
  await expect(page.getByText('今天的新卡上限（1 张）已经学完，还有 1 张新卡在排队。')).toBeVisible();
  await page.getByRole('button', { name: '今天再学 1 张' }).click();
  await expect(page.getByRole('button', { name: '显示答案' })).toBeVisible();
});

test("18 · batch add: l' nouns with (f.) marks import; a missing gender can be chosen in the preview", async ({ page }) => {
  await go(page, '/vocab');
  await page.getByRole('button', { name: '批量录入' }).click();
  const dlg = page.getByRole('dialog', { name: '批量录入' });
  await dlg.locator('textarea').fill("l' assiette (f.) | plate | 盘子\nl’huile (f.)\nla pomme (f.) | apple\nl'acteur | actor");
  await dlg.getByRole('button', { name: '预览' }).click();
  await expect(dlg.getByText('新增 3')).toBeVisible();
  await expect(dlg.getByText("l'assiette", { exact: true })).toBeVisible();
  await expect(dlg.getByText('la pomme', { exact: true })).toBeVisible();
  await expect(dlg.getByText('名词必须标注阴阳性')).toHaveCount(1);
  await dlg.getByRole('group', { name: '选择阴阳性' }).getByRole('button', { name: '阳性 m.' }).click();
  await expect(dlg.getByText('新增 4')).toBeVisible();
  await dlg.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('导入 4 条，跳过 0 条')).toBeVisible();
  for (const w of ["l'assiette", "l'huile", 'la pomme', "l'acteur"]) await expect(page.getByText(w, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/\(f\.\)/)).toHaveCount(0);
});
