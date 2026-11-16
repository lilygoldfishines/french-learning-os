import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, remove, update } from '../db/db';
import { addExpression, ValidationError } from '../db/items';
import { findExpressionDuplicate } from '../db/rules';
import { EXPRESSION_CATEGORIES, EXPR_CAT_LABEL, NATURALNESS, NATURALNESS_LABEL, REGISTERS, REGISTER_LABEL, type Expression } from '../db/types';
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Textarea, useToast } from '../ui/kit';
import { ExamplesEditor } from '../features/ListEditors';
import { KnowledgeTabs } from './More';

type Draft = Omit<Expression, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'> & { id?: string };
const empty = (): Draft => ({ text: '', defEn: '', defZh: '', context: '', register: 'courant', category: '', examples: [], dialogue: '', naturalness: '', notes: '' });

function Editor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const toast = useToast();
  const [x, setX] = useState(initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setX((p) => ({ ...p, [k]: v }));
  const save = async () => {
    try {
      const { id, ...rest } = x;
      if (id) {
        const dup = findExpressionDuplicate(rest, await all<Expression>('expression'), id);
        if (dup) throw new ValidationError([`已存在相同表达：${dup.existing.text}`]);
        await update<Expression>('expression', id, rest);
      } else await addExpression(rest);
      toast('已保存');
      onClose();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="space-y-3">
      <Field label="法语表达 *"><Input lang="fr" className="fr text-lg" value={x.text} onChange={(e) => set('text', e.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="英文释义"><Textarea rows={2} value={x.defEn ?? ''} onChange={(e) => set('defEn', e.target.value)} /></Field>
        <Field label="中文解释"><Textarea rows={2} value={x.defZh ?? ''} onChange={(e) => set('defZh', e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="分类"><Select value={x.category ?? ''} onChange={(e) => set('category', e.target.value)} options={[{ value: '', label: '—' }, ...EXPRESSION_CATEGORIES.map((c) => ({ value: c, label: EXPR_CAT_LABEL[c] }))]} /></Field>
        <Field label="语域"><Select value={x.register ?? ''} onChange={(e) => set('register', e.target.value)} options={REGISTERS.map((r) => ({ value: r, label: REGISTER_LABEL[r] }))} /></Field>
        <Field label="自然度"><Select value={x.naturalness ?? ''} onChange={(e) => set('naturalness', e.target.value)} options={[{ value: '', label: '—' }, ...NATURALNESS.map((n) => ({ value: n, label: NATURALNESS_LABEL[n] }))]} /></Field>
      </div>
      <Field label="使用语境"><Input value={x.context ?? ''} onChange={(e) => set('context', e.target.value)} placeholder="如：和剧组同事闲聊；正式邮件开头" /></Field>
      <Field label="例句"><ExamplesEditor value={x.examples} onChange={(v) => set('examples', v)} /></Field>
      <Field label="示例对话"><Textarea lang="fr" className="fr" rows={4} value={x.dialogue ?? ''} onChange={(e) => set('dialogue', e.target.value)} placeholder={'— …\n— …'} /></Field>
      <Field label="笔记"><Textarea rows={2} value={x.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex justify-between">
        <div>{x.id && <Button kind="danger" onClick={async () => { if (confirm('删除？')) { await remove('expression', x.id!); onClose(); } }}>删除</Button>}</div>
        <div className="flex gap-2"><Button onClick={onClose}>取消</Button><Button kind="primary" onClick={save}>保存</Button></div>
      </div>
    </div>
  );
}

export default function ExpressionsPage() {
  const list = useLiveQuery(() => all<Expression>('expression'), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [reg, setReg] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const rows = useMemo(() => (list ?? [])
    .filter((x) => !q || `${x.text} ${x.defEn} ${x.defZh}`.toLowerCase().includes(q.toLowerCase()))
    .filter((x) => !cat || x.category === cat)
    .filter((x) => !reg || x.register === reg)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [list, q, cat, reg]);
  return (
    <div>
      <KnowledgeTabs />
      <PageHeader title="表达" sub={`${list?.length ?? 0} 条地道表达与句型`} actions={<Button kind="primary" onClick={() => setEditing(empty())}>＋ 表达</Button>} />
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Input className="md:col-span-2" placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索表达" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: '', label: '全部分类' }, ...EXPRESSION_CATEGORIES.map((c) => ({ value: c, label: EXPR_CAT_LABEL[c] }))]} />
        <Select value={reg} onChange={(e) => setReg(e.target.value)} options={[{ value: '', label: '全部语域' }, ...REGISTERS.map((r) => ({ value: r, label: REGISTER_LABEL[r] }))]} />
      </div>
      {list?.length === 0 ? <Empty>还没有表达。</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((x) => (
            <li key={x.id}>
              <button className="w-full px-4 py-3 text-left hover:bg-paper" onClick={() => setEditing(x)}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="fr text-lg">{x.text}</span>
                  {x.register && <Badge>{REGISTER_LABEL[x.register] ?? x.register}</Badge>}
                  {x.naturalness && <Badge tone={x.naturalness === 'natural' ? 'good' : x.naturalness === 'inappropriate' || x.naturalness === 'correct-unnatural' ? 'warn' : 'neutral'}>{NATURALNESS_LABEL[x.naturalness]}</Badge>}
                </div>
                <div className="truncate text-sm text-muted">{[x.defEn, x.defZh].filter(Boolean).join(' · ') || '—'}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? '编辑表达' : '新表达'} wide>
        {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
