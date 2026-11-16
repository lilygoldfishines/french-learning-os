import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, db, remove, update } from '../db/db';
import { recordCorrectUse, recordRecurrence } from '../db/items';
import { VERIFY_MIN_SPAN_DAYS, VERIFY_MIN_USES } from '../db/rules';
import { ERROR_STATUS, ERROR_STATUS_LABEL, ERROR_TYPES, ERROR_TYPE_LABEL, type ErrorEntry, type ErrorType } from '../db/types';
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Section, Select, Stat, Textarea, useToast } from '../ui/kit';
import { ErrorForm } from '../features/QuickAdd';
import { KnowledgeTabs } from './More';

const tone = (s: ErrorEntry['status']) => (s === 'verified' ? 'good' : s === 'practicing' ? 'warn' : 'bad');
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN');

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const e = useLiveQuery(() => db.error.get(id), [id]);
  const [edit, setEdit] = useState<Partial<ErrorEntry> | null>(null);
  if (!e) return null;
  const lastOcc = e.occurrences.reduce((m, o) => (o.date > m ? o.date : m), '');
  const validUses = e.correctUses.filter((d) => d > lastOcc).sort();
  if (edit) {
    const set = <K extends keyof ErrorEntry>(k: K, v: ErrorEntry[K]) => setEdit((p) => ({ ...p, [k]: v }));
    return (
      <div className="space-y-3">
        <Field label="原句"><Textarea lang="fr" className="fr" rows={2} value={edit.original ?? ''} onChange={(x) => set('original', x.target.value)} /></Field>
        <Field label="修正"><Textarea lang="fr" className="fr" rows={2} value={edit.corrected ?? ''} onChange={(x) => set('corrected', x.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="类型"><Select value={edit.errorType} onChange={(x) => set('errorType', x.target.value as ErrorType)} options={ERROR_TYPES.map((t) => ({ value: t, label: ERROR_TYPE_LABEL[t] }))} /></Field>
          <Field label="相关语法点"><Input value={edit.grammarRef ?? ''} onChange={(x) => set('grammarRef', x.target.value)} /></Field>
        </div>
        <Field label="解释"><Textarea rows={2} value={edit.explanation ?? ''} onChange={(x) => set('explanation', x.target.value)} /></Field>
        <Field label="笔记"><Textarea rows={2} value={edit.notes ?? ''} onChange={(x) => set('notes', x.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button onClick={() => setEdit(null)}>取消</Button><Button kind="primary" onClick={async () => {
          const { original, corrected, errorType, grammarRef, explanation, notes } = edit;
          await update<ErrorEntry>('error', id, { original, corrected, errorType, grammarRef, explanation, notes });
          setEdit(null);
        }}>保存</Button></div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="fr text-lg"><s className="text-bad/80">{e.original}</s></div>
        <div className="fr text-lg text-good">{e.corrected}</div>
        {e.explanation && <p className="mt-1 text-sm text-muted">{e.explanation}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={tone(e.status)}>{ERROR_STATUS_LABEL[e.status]}</Badge>
          <Badge>{ERROR_TYPE_LABEL[e.errorType]}</Badge>
          {e.grammarRef && <Badge tone="accent">{e.grammarRef}</Badge>}
        </div>
      </div>
      <div className="rounded-md bg-accent-soft p-3 text-sm">
        验证进度：上次出错之后用对 {validUses.length} / {VERIFY_MIN_USES} 次
        {validUses.length >= 2 && ` · 间隔 ${Math.floor((Date.parse(validUses[validUses.length - 1]) - Date.parse(validUses[0])) / 86400000)} / ${VERIFY_MIN_SPAN_DAYS} 天`}
        <div className="text-xs text-muted">需要在之后的真实练习（写作、口语）里用对至少 {VERIFY_MIN_USES} 次，且相隔 {VERIFY_MIN_SPAN_DAYS} 天以上，才算解决。再犯一次就重新计算。</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={async () => { await recordCorrectUse(id); toast('已记录一次正确使用'); }}>✓ 这次用对了</Button>
        <Button onClick={async () => { await recordRecurrence(id, '手动记录'); toast('已记录再次出错'); }}>✗ 又犯了</Button>
      </div>
      <div className="grid gap-4 text-sm md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-muted">出错记录（{e.occurrences.length}）</div>
          <ul className="space-y-0.5">{[...e.occurrences].reverse().map((o, i) => <li key={i}>{day(o.date)}{o.source ? ` · ${o.source}` : ''}</li>)}</ul>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">正确使用（{e.correctUses.length}）</div>
          <ul className="space-y-0.5">{[...e.correctUses].reverse().map((d, i) => <li key={i} className={d > lastOcc ? '' : 'text-faint'}>{day(d)}</li>)}</ul>
        </div>
      </div>
      <div className="flex justify-between">
        <Button kind="danger" onClick={async () => { if (confirm('删除这条错误记录？')) { await remove('error', id); onClose(); } }}>删除</Button>
        <Button onClick={() => setEdit(e)}>编辑</Button>
      </div>
    </div>
  );
}

export default function ErrorsPage() {
  const list = useLiveQuery(() => all<ErrorEntry>('error'), []);
  const [status, setStatus] = useState('unresolved');
  const [type, setType] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const stats = useMemo(() => {
    const l = list ?? [];
    const byType = ERROR_TYPES.map((t) => {
      const items = l.filter((e) => e.errorType === t && e.status !== 'verified');
      return { t, n: items.reduce((a, e) => a + e.occurrences.length, 0) };
    }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    return {
      open: l.filter((e) => e.status === 'open').length,
      practicing: l.filter((e) => e.status === 'practicing').length,
      verified: l.filter((e) => e.status === 'verified').length,
      recurring: l.filter((e) => e.occurrences.length >= 2 && e.status !== 'verified').length,
      byType,
      focus: byType.filter((x) => x.n >= 3),
    };
  }, [list]);
  const rows = (list ?? [])
    .filter((e) => status === 'all' || (status === 'unresolved' ? e.status !== 'verified' : e.status === status))
    .filter((e) => !type || e.errorType === type)
    .sort((a, b) => b.occurrences.length - a.occurrences.length || b.updatedAt.localeCompare(a.updatedAt));
  const maxN = Math.max(1, ...stats.byType.map((x) => x.n));

  return (
    <div>
      <KnowledgeTabs />
      <PageHeader title="错误库" sub="改过一次不算掌握；要在之后的练习中验证" actions={<Button kind="primary" onClick={() => setAdding(true)}>＋ 记录错误</Button>} />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Section title="状态">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="未解决" value={stats.open} />
            <Stat label="练习中" value={stats.practicing} />
            <Stat label="反复出现" value={stats.recurring} sub="≥ 2 次且未解决" />
            <Stat label="已验证解决" value={stats.verified} />
          </div>
        </Section>
        <Section title="未解决错误 · 按类型" className="md:col-span-2">
          {stats.byType.length ? (
            <ul className="space-y-1.5 text-sm">
              {stats.byType.map((x) => (
                <li key={x.t} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2">
                  <span>{ERROR_TYPE_LABEL[x.t]}</span>
                  <div className="h-2 rounded bg-line"><div className={`h-2 rounded ${x.n >= 3 ? 'bg-bad' : 'bg-accent'}`} style={{ width: `${(x.n / maxN) * 100}%` }} /></div>
                  <span className="text-right text-muted">{x.n}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">暂无</p>}
          {stats.focus.length > 0 && <p className="mt-2 text-xs text-bad">需要专项训练：{stats.focus.map((x) => ERROR_TYPE_LABEL[x.t]).join('、')}</p>}
        </Section>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'unresolved', label: '未解决（含练习中）' }, { value: 'all', label: '全部' }, ...ERROR_STATUS.map((s) => ({ value: s, label: ERROR_STATUS_LABEL[s] }))]} />
        <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: '全部类型' }, ...ERROR_TYPES.map((t) => ({ value: t, label: ERROR_TYPE_LABEL[t] }))]} />
      </div>
      {list?.length === 0 ? <Empty>还没有错误记录。写作或口语后，把被纠正的地方记下来。</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((e) => (
            <li key={e.id}>
              <button className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-paper" onClick={() => setOpen(e.id)}>
                <div className="min-w-0">
                  <div className="fr truncate"><s className="text-bad/80">{e.original}</s></div>
                  <div className="fr truncate text-good">{e.corrected}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={tone(e.status)}>{ERROR_STATUS_LABEL[e.status]}</Badge>
                  <span className="text-xs text-muted">{ERROR_TYPE_LABEL[e.errorType]} · {e.occurrences.length} 次</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="错误详情">{open && <Detail id={open} onClose={() => setOpen(null)} />}</Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="记录错误"><ErrorForm done={() => setAdding(false)} /></Modal>
    </div>
  );
}
