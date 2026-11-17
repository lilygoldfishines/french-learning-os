import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, remove, update } from '../db/db';
import { addSentence } from '../db/items';
import type { Sentence } from '../db/types';
import { Button, Empty, Field, Input, Modal, PageHeader, Textarea, useToast } from '../ui/kit';
import { KnowledgeTabs } from './More';
import { Para, ReadFooter, ReadSection } from '../features/ReadView';
import { SpeakButton } from '../features/Speak';
import { tr } from '../i18n';

type Draft = Omit<Sentence, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'> & { id?: string };

function Editor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const toast = useToast();
  const [s, setS] = useState(initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setS((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <Field label={tr('法语句子 *')}><Textarea lang="fr" className="fr text-lg" value={s.fr} onChange={(e) => set('fr', e.target.value)} /></Field>
      <Field label="English"><Textarea rows={2} value={s.en ?? ''} onChange={(e) => set('en', e.target.value)} /></Field>
      <Field label={tr('中文')}><Textarea rows={2} value={s.zh ?? ''} onChange={(e) => set('zh', e.target.value)} /></Field>
      <Field label={tr('出处')}><Input value={s.source ?? ''} onChange={(e) => set('source', e.target.value)} placeholder={tr('如：Le Monde, 2026-11-14；《Portrait de la jeune fille en feu》')} /></Field>
      <Field label={tr('笔记')}><Textarea rows={2} value={s.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex justify-between">
        <div>{s.id && <Button kind="danger" onClick={async () => { if (confirm(tr('删除？'))) { await remove('sentence', s.id!); onClose(); } }}>{tr('删除')}</Button>}</div>
        <div className="flex gap-2">
          <Button onClick={onClose}>{tr('取消')}</Button>
          <Button kind="primary" onClick={async () => {
            try { const { id, ...rest } = s; if (id) await update<Sentence>('sentence', id, rest); else await addSentence(rest); toast(tr('已保存')); onClose(); }
            catch (e) { setErr((e as Error).message); }
          }}>{tr('保存')}</Button>
        </div>
      </div>
    </div>
  );
}

export function SentenceView({ s, onEdit }: { s: Sentence; onEdit?: () => void }) {
  return (
    <article className="space-y-5">
      <div className="flex items-start gap-3">
        <SpeakButton text={s.fr} className="mt-1" />
        <p className="fr text-[22px] leading-snug" lang="fr">{s.fr}</p>
      </div>
      {(s.en || s.zh) && (
        <div className="space-y-1">
          {s.en && <p>{s.en}</p>}
          {s.zh && <p className="text-muted">{s.zh}</p>}
        </div>
      )}
      <ReadSection title={tr('出处')} show={!!s.source}><Para>{s.source}</Para></ReadSection>
      <ReadSection title={tr('笔记')} show={!!s.notes}><Para>{s.notes}</Para></ReadSection>
      <ReadFooter onEdit={onEdit} />
    </article>
  );
}

export default function SentencesPage() {
  const list = useLiveQuery(() => all<Sentence>('sentence'), []);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? list?.find((x) => x.id === viewingId) : undefined;
  const rows = (list ?? []).filter((s) => !q || `${s.fr} ${s.en} ${s.zh} ${s.source}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div>
      <KnowledgeTabs />
      <PageHeader title={tr('句子')} sub={tr('从真实材料里摘下来的好句子，会进入复习')} actions={<Button kind="primary" onClick={() => setEditing({ fr: '', en: '', zh: '', source: '', notes: '' })}>{tr('＋ 句子')}</Button>} />
      <Input className="mb-4 max-w-md" placeholder={tr('搜索')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('搜索句子')} />
      {list?.length === 0 ? <Empty>{tr('还没有句子。')}</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((s) => (
            <li key={s.id}>
              <button className="w-full px-4 py-3 text-left hover:bg-paper" onClick={() => setViewingId(s.id)}>
                <div className="fr">{s.fr}</div>
                <div className="text-sm text-muted">{[s.en, s.zh].filter(Boolean).join(' · ')}</div>
                {s.source && <div className="text-xs text-faint">{s.source}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!viewing && !editing} onClose={() => setViewingId(null)} title={tr('句子')}>
        {viewing && <SentenceView s={viewing} onEdit={() => setEditing(viewing)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? tr('编辑句子') : tr('新句子')}>
        {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
