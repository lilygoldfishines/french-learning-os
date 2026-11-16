import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, db, remove, update } from '../db/db';
import { addGrammar, ValidationError } from '../db/items';
import { ensureCard } from '../srs';
import { CEFR_LEVELS, type Cefr, type Grammar } from '../db/types';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Textarea, cx, useToast } from '../ui/kit';
import { LinesEditor } from '../features/ListEditors';
import { KnowledgeTabs } from './More';

const MASTERY = ['未学', '了解', '会用但常错', '基本掌握', '熟练'];
type Draft = Omit<Grammar, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'> & { id?: string };
const empty = (cefr: Cefr = 'B1'): Draft => ({
  name: '', cefr, category: '', explanationEn: '', explanationZh: '', structure: '', conditions: '', correctExamples: [], incorrectExamples: [],
  commonErrors: '', exceptions: '', mastery: 0, skipped: false, notes: '',
});

function Editor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const toast = useToast();
  const [g, setG] = useState(initial);
  const [err, setErr] = useState('');
  const inReview = useLiveQuery(async () => (g.id ? !!(await db.card.where('[itemType+itemId]').equals(['grammar', g.id]).filter((c) => !c.deletedAt).first()) : false), [g.id]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setG((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const { id, ...rest } = g;
      if (id) await update<Grammar>('grammar', id, rest);
      else await addGrammar(rest);
      toast('已保存');
      onClose();
    } catch (e) { setErr(e instanceof ValidationError ? e.message : String(e)); }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_6rem_10rem]">
        <Field label="语法名称 *"><Input value={g.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="等级"><Select value={g.cefr} onChange={(e) => set('cefr', e.target.value as Cefr)} options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))} /></Field>
        <Field label="类别"><Input value={g.category} onChange={(e) => set('category', e.target.value)} /></Field>
      </div>
      <Field label="结构"><Input lang="fr" className="fr" value={g.structure ?? ''} onChange={(e) => set('structure', e.target.value)} placeholder="如：bien que + subjonctif" /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="English explanation"><Textarea rows={4} value={g.explanationEn ?? ''} onChange={(e) => set('explanationEn', e.target.value)} /></Field>
        <Field label="中文辅助解释"><Textarea rows={4} value={g.explanationZh ?? ''} onChange={(e) => set('explanationZh', e.target.value)} /></Field>
      </div>
      <Field label="使用条件与场景"><Textarea rows={2} value={g.conditions ?? ''} onChange={(e) => set('conditions', e.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="正确例句（每行一句）"><LinesEditor value={g.correctExamples} onChange={(v) => set('correctExamples', v)} /></Field>
        <Field label="错误例句（每行一句）"><LinesEditor value={g.incorrectExamples} onChange={(v) => set('incorrectExamples', v)} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="常见错误"><Textarea rows={2} value={g.commonErrors ?? ''} onChange={(e) => set('commonErrors', e.target.value)} /></Field>
        <Field label="特殊情况"><Textarea rows={2} value={g.exceptions ?? ''} onChange={(e) => set('exceptions', e.target.value)} /></Field>
      </div>
      <Field label={`掌握程度：${MASTERY[g.mastery]}`}>
        <input type="range" min={0} max={4} value={g.mastery} onChange={(e) => set('mastery', Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.skipped} onChange={(e) => set('skipped', e.target.checked)} /> 已熟练，跳过</label>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          {g.id && <Button kind="danger" onClick={async () => { if (confirm('删除？')) { await remove('grammar', g.id!); onClose(); } }}>删除</Button>}
          {g.id && !inReview && <Button onClick={async () => { await ensureCard('grammar', g.id!); toast('已加入复习'); }}>加入复习</Button>}
        </div>
        <div className="flex gap-2"><Button onClick={onClose}>取消</Button><Button kind="primary" onClick={save}>保存</Button></div>
      </div>
    </div>
  );
}

export default function GrammarPage() {
  const list = useLiveQuery(() => all<Grammar>('grammar'), []);
  const [level, setLevel] = useState<Cefr | ''>('');
  const [q, setQ] = useState('');
  const [hideSkipped, setHideSkipped] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const grouped = useMemo(() => {
    const out: Record<string, Grammar[]> = {};
    for (const g of list ?? []) {
      if (level && g.cefr !== level) continue;
      if (hideSkipped && g.skipped) continue;
      if (q && !`${g.name} ${g.category} ${g.structure}`.toLowerCase().includes(q.toLowerCase())) continue;
      (out[g.cefr] ??= []).push(g);
    }
    return out;
  }, [list, level, q, hideSkipped]);

  return (
    <div>
      <KnowledgeTabs />
      <PageHeader title="语法" sub="不必按等级顺序学；已熟练的可以直接跳过" actions={<Button kind="primary" onClick={() => setEditing(empty(level || 'B1'))}>＋ 语法点</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索语法" />
        {(['', ...CEFR_LEVELS] as const).map((l) => (
          <button key={l || 'all'} onClick={() => setLevel(l)} className={cx('rounded-full border px-3 py-1 text-sm', level === l ? 'border-ink bg-ink text-paper' : 'border-line')}>{l || '全部'}</button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-sm text-muted"><input type="checkbox" checked={hideSkipped} onChange={(e) => setHideSkipped(e.target.checked)} />隐藏已跳过</label>
      </div>
      <div className="space-y-6">
        {CEFR_LEVELS.filter((l) => grouped[l]).map((l) => (
          <section key={l}>
            <h2 className="mb-2 font-serif text-xl">{l} <span className="text-sm text-muted">· {grouped[l].filter((g) => g.skipped || g.mastery >= 3).length}/{grouped[l].length}</span></h2>
            <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
              {grouped[l].map((g) => (
                <li key={g.id}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-paper" onClick={() => setEditing(g)}>
                    <span className={cx(g.skipped && 'text-faint')}>{g.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {g.category && <span className="hidden text-xs text-muted md:inline">{g.category}</span>}
                      {g.skipped ? <Badge>跳过</Badge> : <Badge tone={g.mastery >= 3 ? 'good' : g.mastery >= 1 ? 'warn' : 'neutral'}>{MASTERY[g.mastery]}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? '语法点' : '新语法点'} wide>
        {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

