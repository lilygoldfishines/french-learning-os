import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMeta } from '../db/db';
import { requestPersistence, saveSettings, useSettings } from '../db/bootstrap';
import { CEFR_LEVELS, type Cefr } from '../db/types';
import { download, exportAll, markBackedUp, restore, verifyBackup, type Backup } from '../io/backup';
import { Button, Field, Input, PageHeader, Section, Select, useToast } from '../ui/kit';
import { aiFillVocab, AiError, DEFAULT_MODEL, saveAiConfig, useAiConfig } from '../ai/fill';

function AiSection() {
  const toast = useToast();
  const cfg = useAiConfig();
  const [key, setKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => { if (cfg) setModel(cfg.model); }, [cfg?.model]);
  return (
    <Section title="AI 助手（可选）">
      <p className="text-sm text-muted">填入你自己的 Claude API 密钥后，新词可以一键补全阴阳性、音标、中英文释义、例句和搭配。不填也能正常使用所有其他功能。</p>
      {cfg ? (
        <div className="mt-3 space-y-2 text-sm">
          <div>✓ 已设置密钥（…{cfg.apiKey.slice(-4)}）· 模型 {cfg.model}</div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={testing} onClick={async () => {
              setTesting(true); setResult('');
              try { const f = await aiFillVocab('la scène', cfg); setResult(`✓ 连接正常：${f.article} ${f.lemma} · ${f.gender} · ${f.defEn} · ${f.defZh}`); }
              catch (e) { setResult(`✗ ${e instanceof AiError ? e.message : String(e)}`); }
              setTesting(false);
            }}>{testing ? '测试中…' : '测试连接'}</Button>
            <Button kind="danger" onClick={async () => { await saveAiConfig(null); toast('已删除密钥'); }}>删除密钥</Button>
          </div>
          {result && <p className={result.startsWith('✓') ? 'text-good' : 'text-bad'}>{result}</p>}
        </div>
      ) : (
        <form className="mt-3 grid gap-3 md:grid-cols-[1fr_12rem_auto] md:items-end" onSubmit={async (e) => { e.preventDefault(); await saveAiConfig({ apiKey: key, model }); setKey(''); toast('密钥已保存在本机'); }}>
          <Field label="API 密钥"><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" /></Field>
          <Field label="模型"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
          <Button kind="primary" type="submit" disabled={!key.trim()}>保存</Button>
        </form>
      )}
      <p className="mt-3 text-xs text-muted">密钥只存在这台设备上，不会写进备份文件，也不会同步到其他地方。使用 AI 补全时，你输入的词会发送给 Anthropic 处理。密钥在 console.anthropic.com 创建，按用量付费。</p>
    </Section>
  );
}

const LABEL: Record<string, string> = {
  vocab: '词汇', grammar: '语法', expression: '表达', sentence: '句子', error: '错误', link: '关联', card: '复习卡', reviewLog: '复习记录',
  goal: '目标', timeBlock: '时间块', session: '学习记录', assessment: '评估', retro: '复盘',
};

async function backupNow(prefix = 'flos-backup') {
  const b = await exportAll();
  download(`${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(b));
  await markBackedUp();
  return b;
}

export default function SettingsPage() {
  const toast = useToast();
  const s = useSettings();
  const last = useLiveQuery(() => getMeta<string | null>('lastBackupAt', null), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');
  const [pending, setPending] = useState<{ backup: Backup; problems: string[] } | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB`));
  }, []);

  return (
    <div>
      <PageHeader title="设置与备份" />
      <div className="space-y-4">
        <Section title="备份">
          <p className="text-sm">上次备份：{last ? new Date(last).toLocaleString('zh-CN') : '从未'}</p>
          <p className="mt-1 text-xs text-muted">完整备份包含所有数据（含已删除记录），带校验和。建议存到 iCloud Drive 或 Google Drive。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button kind="primary" onClick={async () => { await backupNow(); toast('备份已下载'); }}>下载完整备份</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-line bg-panel px-3 py-1.5 text-sm hover:border-faint">
              从备份恢复…
              <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                let raw: unknown;
                try { raw = JSON.parse(await f.text()); } catch { toast('文件不是有效的 JSON', 'bad'); return; }
                const v = await verifyBackup(raw);
                if (!v.backup) { toast(v.problems.join('；'), 'bad'); return; }
                setPending({ backup: v.backup, problems: v.problems });
              }} />
            </label>
          </div>
          {pending && (
            <div className="mt-4 rounded-md border border-line p-3 text-sm">
              <div className="font-medium">备份文件 · {new Date(pending.backup.exportedAt).toLocaleString('zh-CN')} · v{pending.backup.schemaVersion}</div>
              <div className="mt-1 text-muted">{Object.entries(pending.backup.counts).filter(([, n]) => n).map(([k, n]) => `${LABEL[k] ?? k} ${n}`).join(' · ')}</div>
              {pending.problems.length > 0 ? (
                <div className="mt-2 text-bad">验证失败：{pending.problems.join('；')}。为安全起见不能恢复。</div>
              ) : (
                <>
                  <div className="mt-2 text-good">✓ 校验通过</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={async () => { const r = await restore(pending.backup, 'merge'); toast(`合并完成：新增 ${r.added} · 更新 ${r.updated} · 保留本地较新 ${r.skipped}`); setPending(null); }}>合并（推荐）</Button>
                    <Button kind="danger" onClick={async () => {
                      if (!confirm('替换会清空当前所有数据，再写入备份内容。系统会先自动下载一份当前数据的安全备份。确定继续？')) return;
                      await backupNow('flos-before-replace');
                      const r = await restore(pending.backup, 'replace');
                      toast(`已替换：写入 ${r.added} 条`);
                      setPending(null);
                    }}>替换全部</Button>
                    <Button onClick={() => setPending(null)}>取消</Button>
                  </div>
                  <p className="mt-2 text-xs text-muted">合并：只添加本地没有的记录；同一条记录只在备份版本更新时才覆盖，较新的本地数据不会被旧备份覆盖。</p>
                </>
              )}
            </div>
          )}
        </Section>

        <AiSection />

        <Section title="复习">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="每天新卡上限"><Input type="number" min={0} value={s.dailyNewLimit} onChange={(e) => saveSettings({ dailyNewLimit: Number(e.target.value) })} /></Field>
            <Field label="每天复习上限" hint="超出部分顺延到之后几天"><Input type="number" min={10} value={s.dailyReviewLimit} onChange={(e) => saveSettings({ dailyReviewLimit: Number(e.target.value) })} /></Field>
            <Field label={`目标记忆率 ${Math.round(s.retention * 100)}%`} hint="越高复习越频繁">
              <input type="range" min={0.8} max={0.97} step={0.01} value={s.retention} onChange={(e) => saveSettings({ retention: Number(e.target.value) })} className="w-full" />
            </Field>
          </div>
        </Section>

        <Section title="目标">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="目标等级"><Select value={s.targetLevel} onChange={(e) => saveSettings({ targetLevel: e.target.value as Cefr })} options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))} /></Field>
            <Field label="目标日期"><Input type="date" value={s.targetDate} onChange={(e) => saveSettings({ targetDate: e.target.value })} /></Field>
            <Field label="每周学习目标（小时）"><Input type="number" min={0} step={0.5} value={s.weeklyTargetMinutes / 60} onChange={(e) => saveSettings({ weeklyTargetMinutes: Math.round(Number(e.target.value) * 60) })} /></Field>
          </div>
        </Section>

        <Section title="本机存储">
          <p className="text-sm">持久存储：{persisted === null ? '浏览器不支持查询' : persisted ? '✓ 已开启（浏览器不会自动清理）' : '未开启'} · 已用 {usage || '—'}</p>
          {!persisted && <Button className="mt-2" onClick={async () => setPersisted(await requestPersistence())}>申请持久存储</Button>}
          <p className="mt-2 text-xs text-muted">iPhone：请在 Safari 中点「分享 → 添加到主屏幕」，从主屏幕图标打开。只在 Safari 标签页里使用时，系统可能在 7 天未使用后清除本地数据。</p>
        </Section>

        <Section title="关于">
          <p className="text-sm text-muted">French Learning OS · 第二阶段 MVP · 数据只保存在这台设备上（云同步将在下一阶段加入）。</p>
        </Section>
      </div>
    </div>
  );
}
