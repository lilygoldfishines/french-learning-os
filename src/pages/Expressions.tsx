import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, remove, update } from '../db/db';
import { addExpression, ValidationError } from '../db/items';
import { findExpressionDuplicate, parseExpressionLine } from '../db/rules';
import BatchAdd from '../features/BatchAdd';
import { Para, ReadFooter, ReadSection } from '../features/ReadView';
import { SpeakButton } from '../features/Speak';
import { EXPRESSION_CATEGORIES, EXPR_CAT_LABEL, NATURALNESS, NATURALNESS_LABEL, REGISTERS, REGISTER_LABEL, type Expression } from '../db/types';
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Textarea, useToast } from '../ui/kit';
import { ExamplesEditor } from '../features/ListEditors';
import { KnowledgeTabs } from './More';
import { tr, trf } from '../i18n';

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
        if (dup) throw new ValidationError([trf('已存在相同表达：{0}', dup.existing.text)]);
        await update<Expression>('expression', id, rest);
      } else await addExpression(rest);
      toast(tr('已保存'));
      onClose();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="space-y-3">
      <Field label={tr('法语表达 *')}><Input lang="fr" className="fr text-lg" value={x.text} onChange={(e) => set('text', e.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tr('英文释义')}><Textarea rows={2} value={x.defEn ?? ''} onChange={(e) => set('defEn', e.target.value)} /></Field>
        <Field label={tr('中文解释')}><Textarea rows={2} value={x.defZh ?? ''} onChange={(e) => set('defZh', e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={tr('分类')}><Select value={x.category ?? ''} onChange={(e) => set('category', e.target.value)} options={[{ value: '', label: '—' }, ...EXPRESSION_CATEGORIES.map((c) => ({ value: c, label: EXPR_CAT_LABEL[c] }))]} /></Field>
        <Field label={tr('语域')}><Select value={x.register ?? ''} onChange={(e) => set('register', e.target.value)} options={REGISTERS.map((r) => ({ value: r, label: REGISTER_LABEL[r] }))} /></Field>
        <Field label={tr('自然度')}><Select value={x.naturalness ?? ''} onChange={(e) => set('naturalness', e.target.value)} options={[{ value: '', label: '—' }, ...NATURALNESS.map((n) => ({ value: n, label: NATURALNESS_LABEL[n] }))]} /></Field>
      </div>
      <Field label={tr('使用语境')}><Input value={x.context ?? ''} onChange={(e) => set('context', e.target.value)} placeholder={tr('如：和剧组同事闲聊；正式邮件开头')} /></Field>
      <Field group label={tr('例句')}><ExamplesEditor value={x.examples} onChange={(v) => set('examples', v)} /></Field>
      <Field label={tr('示例对话')}><Textarea lang="fr" className="fr" rows={4} value={x.dialogue ?? ''} onChange={(e) => set('dialogue', e.target.value)} placeholder={'— …\n— …'} /></Field>
      <Field label={tr('笔记')}><Textarea rows={2} value={x.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex justify-between">
        <div>{x.id && <Button kind="danger" onClick={async () => { if (confirm(tr('删除？'))) { await remove('expression', x.id!); onClose(); } }}>{tr('删除')}</Button>}</div>
        <div className="flex gap-2"><Button onClick={onClose}>{tr('取消')}</Button><Button kind="primary" onClick={save}>{tr('保存')}</Button></div>
      </div>
    </div>
  );
}

export function ExpressionView({ x, onEdit }: { x: Expression; onEdit?: () => void }) {
  return (
    <article className="space-y-5">
      <header>
        <div className="flex items-start gap-3">
          <h3 className="fr text-[28px] leading-tight" lang="fr">{x.text}</h3>
          <SpeakButton text={x.text} className="mt-1" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {x.register && <Badge>{REGISTER_LABEL[x.register as keyof typeof REGISTER_LABEL] ?? x.register}</Badge>}
          {x.category && <Badge>{EXPR_CAT_LABEL[x.category as keyof typeof EXPR_CAT_LABEL] ?? x.category}</Badge>}
          {x.naturalness && <Badge tone={x.naturalness === 'natural' ? 'good' : x.naturalness === 'inappropriate' || x.naturalness === 'correct-unnatural' ? 'warn' : 'neutral'}>{NATURALNESS_LABEL[x.naturalness as keyof typeof NATURALNESS_LABEL]}</Badge>}
        </div>
      </header>
      {(x.defEn || x.defZh) ? (
        <div className="space-y-1">
          {x.defEn && <p className="text-[17px]">{x.defEn}</p>}
          {x.defZh && <p className="text-muted">{x.defZh}</p>}
        </div>
      ) : <p className="text-sm text-faint">{tr('还没有释义。')}</p>}
      <ReadSection title={tr('使用语境')} show={!!x.context}><Para>{x.context}</Para></ReadSection>
      <ReadSection title={tr('例句')} show={x.examples.length > 0}>
        <ul className="space-y-3">
          {x.examples.map((e, i) => (
            <li key={i} className="flex gap-2">
              <SpeakButton size="sm" text={e.fr} className="mt-0.5" />
              <div>
                <p className="fr italic" lang="fr">{e.fr}</p>
                {e.en && <p className="text-sm text-muted">{e.en}</p>}
                {e.zh && <p className="text-sm text-muted">{e.zh}</p>}
              </div>
            </li>
          ))}
        </ul>
      </ReadSection>
      <ReadSection title={tr('示例对话')} show={!!x.dialogue}>
        <div className="flex gap-2"><SpeakButton size="sm" text={x.dialogue ?? ''} className="mt-0.5" /><Para fr>{x.dialogue}</Para></div>
      </ReadSection>
      <ReadSection title={tr('笔记')} show={!!x.notes}><Para>{x.notes}</Para></ReadSection>
      <ReadFooter onEdit={onEdit} />
    </article>
  );
}

export default function ExpressionsPage() {
  const list = useLiveQuery(() => all<Expression>('expression'), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [reg, setReg] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [batch, setBatch] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? list?.find((x) => x.id === viewingId) : undefined;
  const rows = useMemo(() => (list ?? [])
    .filter((x) => !q || `${x.text} ${x.defEn} ${x.defZh}`.toLowerCase().includes(q.toLowerCase()))
    .filter((x) => !cat || x.category === cat)
    .filter((x) => !reg || x.register === reg)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [list, q, cat, reg]);
  return (
    <div>
      <KnowledgeTabs />
      <PageHeader title={tr('表达')} sub={trf('{0} 条地道表达与句型', list?.length ?? 0)} actions={<><Button onClick={() => setBatch(true)}>{tr('批量录入')}</Button><Button kind="primary" onClick={() => setEditing(empty())}>{tr('＋ 表达')}</Button></>} />
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Input className="md:col-span-2" placeholder={tr('搜索')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('搜索表达')} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: '', label: tr('全部分类') }, ...EXPRESSION_CATEGORIES.map((c) => ({ value: c, label: EXPR_CAT_LABEL[c] }))]} />
        <Select value={reg} onChange={(e) => setReg(e.target.value)} options={[{ value: '', label: tr('全部语域') }, ...REGISTERS.map((r) => ({ value: r, label: REGISTER_LABEL[r] }))]} />
      </div>
      {list?.length === 0 ? <Empty>{tr('还没有表达。')}</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((x) => (
            <li key={x.id}>
              <button className="w-full px-4 py-3 text-left hover:bg-paper" onClick={() => setViewingId(x.id)}>
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
      <Modal open={!!viewing && !editing} onClose={() => setViewingId(null)} title={tr('表达')} wide>
        {viewing && <ExpressionView x={viewing} onEdit={() => setEditing(viewing)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? tr('编辑表达') : tr('新表达')} wide>
        {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={batch} onClose={() => setBatch(false)} title={tr('批量录入')} wide>
        {batch && <BatchAdd kind="expression" onClose={() => setBatch(false)} parse={parseExpressionLine}
          help={<>{tr('每行一条：')}<span className="fr">{tr('表达 | 英文 | 中文')}</span>{tr('。释义可以只写一种，中英文顺序不限；语域、例句等导入后再补。')}</>}
          placeholder={tr('faire la grasse matinée | to sleep in | 睡懒觉\navoir le cafard | to feel down | 情绪低落\nça me dit quelque chose | 好像有点印象')} />}
      </Modal>
    </div>
  );
}
