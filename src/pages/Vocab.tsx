import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, remove } from '../db/db';
import { addVocab, emptyVocab, saveVocab, ValidationError } from '../db/items';
import { displayLemma, normalize, parseBatchLine } from '../db/rules';
import {
  CEFR_LEVELS, LEARN_STATUS, LEARN_STATUS_LABEL, POS, POS_LABEL, TOPIC_LABEL, VOCAB_TOPICS, type Gender, type Pos, type Vocab,
} from '../db/types';
import { Button, GramTag, Empty, Field, Input, Modal, PageHeader, Select, TagsInput, Textarea, useToast } from '../ui/kit';
import { GenderPicker } from '../features/QuickAdd';
import { ExamplesEditor } from '../features/ListEditors';
import BatchAdd from '../features/BatchAdd';
import { aiFillVocab, AiError, mergeFill, useAiConfig } from '../ai/fill';
import { KnowledgeTabs } from './More';
import { tr, trf } from '../i18n';
import { isAudioFile, SpeakButton } from '../features/Speak';

type Draft = Omit<Vocab, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'> & { id?: string };

export function VocabEditor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Draft>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [dup, setDup] = useState(false);
  const ai = useAiConfig();
  const [busy, setBusy] = useState(false);
  const runAi = async () => {
    if (!ai) return;
    setBusy(true); setProblems([]);
    try {
      const word = v.article ? (v.article.endsWith("'") ? `${v.article}${v.lemma}` : `${v.article} ${v.lemma}`) : v.lemma;
      const f = await aiFillVocab(word, ai, { posHint: v.id ? v.pos : undefined });
      setV((cur) => mergeFill(cur, f));
      toast(tr('已补全空白字段'));
    } catch (e) { setProblems([e instanceof AiError ? e.message : String(e)]); }
    setBusy(false);
  };
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = async (allowDup = false) => {
    try {
      const { id, ...rest } = v;
      const data = { ...rest, gender: rest.pos === 'noun' ? rest.gender : ('none' as Gender) };
      if (id) await saveVocab(id, data);
      else await addVocab(data, { allowPossibleDup: allowDup });
      toast(tr('已保存'));
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) {
        setProblems(e.problems);
        setDup(e.code === 'possible-dup');
      } else setProblems([(e as Error).message]);
    }
  };
  return (
    <div className="space-y-4">
      {ai && (
        <div className="flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-sm">
          <span className="text-muted">{tr('只填空白字段，不会覆盖你已经写的内容')}</span>
          <Button disabled={!v.lemma.trim() || busy} onClick={runAi}>{busy ? tr('查询中…') : tr('AI 补全')}</Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[6rem_1fr_10rem]">
        <Field label={tr('冠词')}><Input lang="fr" className="fr" value={v.article ?? ''} onChange={(e) => set('article', e.target.value)} placeholder="le / la / l'" /></Field>
        <Field label={tr('法语词条 *')}><Input lang="fr" className="fr text-lg" value={v.lemma} onChange={(e) => set('lemma', e.target.value)} /></Field>
        <Field label={tr('词性 *')}><Select value={v.pos} onChange={(e) => set('pos', e.target.value as Pos)} options={POS.map((p) => ({ value: p, label: POS_LABEL[p] }))} /></Field>
      </div>
      {v.pos === 'noun' && <Field group label={tr('阴阳性 *')}><GenderPicker value={v.gender} onChange={(g) => set('gender', g)} /></Field>}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={tr('复数')}><Input lang="fr" value={v.plural ?? ''} onChange={(e) => set('plural', e.target.value)} /></Field>
        <Field label={tr('IPA 音标')}><Input value={v.ipa ?? ''} onChange={(e) => set('ipa', e.target.value)} /></Field>
        <Field label={tr('发音链接')}><Input type="url" value={v.audioUrl ?? ''} onChange={(e) => set('audioUrl', e.target.value)} placeholder={tr('如 Forvo 链接')} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tr('英文释义')}><Textarea rows={2} value={v.defEn ?? ''} onChange={(e) => set('defEn', e.target.value)} /></Field>
        <Field label={tr('中文解释')}><Textarea rows={2} value={v.defZh ?? ''} onChange={(e) => set('defZh', e.target.value)} /></Field>
      </div>
      <Field group label={tr('例句')}><ExamplesEditor value={v.examples} onChange={(x) => set('examples', x)} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field group label={tr('同义词')}><TagsInput label={tr('同义词')} value={v.synonyms} onChange={(x) => set('synonyms', x)} /></Field>
        <Field group label={tr('反义词')}><TagsInput label={tr('反义词')} value={v.antonyms} onChange={(x) => set('antonyms', x)} /></Field>
        <Field group label={tr('相关词汇')}><TagsInput label={tr('相关词汇')} value={v.related} onChange={(x) => set('related', x)} /></Field>
        <Field group label={tr('常见搭配')}><TagsInput label={tr('常见搭配')} value={v.collocations} onChange={(x) => set('collocations', x)} /></Field>
        <Field group label={tr('常见介词')}><TagsInput label={tr('常见介词')} value={v.prepositions} onChange={(x) => set('prepositions', x)} placeholder="à, de, sur…" /></Field>
        {v.pos === 'verb' && v.lemma.trim() && <div className="flex items-end"><a className="text-sm text-accent underline" href={`#/conjugation?v=${encodeURIComponent(v.lemma.trim())}`}>{tr('查看完整变位表 →')}</a></div>}
        {v.pos === 'verb' && <Field label={tr('动词变位要点')}><Input value={v.conjugation ?? ''} onChange={(e) => set('conjugation', e.target.value)} placeholder={tr('如：3e groupe, pp. pris')} /></Field>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={tr('主题')}>
          <Select multiple className="h-28" value={v.topics} onChange={(e) => set('topics', Array.from(e.target.selectedOptions).map((o) => o.value))}
            options={VOCAB_TOPICS.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))} />
        </Field>
        <Field label="CEFR"><Select value={v.cefr ?? ''} onChange={(e) => set('cefr', (e.target.value || undefined) as Vocab['cefr'])} options={[{ value: '', label: '—' }, ...CEFR_LEVELS.map((l) => ({ value: l, label: l }))]} /></Field>
        <Field label={tr('学习状态')}><Select value={v.status} onChange={(e) => set('status', e.target.value as Vocab['status'])} options={LEARN_STATUS.map((s) => ({ value: s, label: LEARN_STATUS_LABEL[s] }))} /></Field>
      </div>
      <Field label={tr('个人笔记')}><Textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {problems.length > 0 && <div className="text-sm text-bad">{problems.join(tr('；'))}</div>}
      <div className="flex justify-between gap-2">
        <div>{v.id && <Button kind="danger" onClick={async () => { if (confirm(tr('删除这个词条？'))) { await remove('vocab', v.id!); onClose(); } }}>{tr('删除')}</Button>}</div>
        <div className="flex gap-2">
          {dup && <Button onClick={() => save(true)}>{tr('仍然保存为新词条')}</Button>}
          <Button onClick={onClose}>{tr('取消')}</Button>
          <Button kind="primary" onClick={() => save()}>{tr('保存')}</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </section>
  );
}

/** Read-only page for one word; editing is one tap away. */
export function VocabView({ v, onEdit }: { v: Vocab; onEdit: () => void }) {
  const word = displayLemma(v);
  const lists: [string, string[]][] = [
    [tr('同义词'), v.synonyms], [tr('反义词'), v.antonyms], [tr('相关词汇'), v.related],
    [tr('常见搭配'), v.collocations], [tr('常见介词'), v.prepositions],
  ];
  return (
    <article className="space-y-5">
      <header>
        <div className="flex items-center gap-3">
          <h3 className="fr text-[32px] leading-tight" lang="fr">{word}</h3>
          <SpeakButton text={word} audioUrl={v.audioUrl} />
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <GramTag pos={v.pos} gender={v.gender} />
          {v.ipa && <span className="fr-meta text-muted">/{v.ipa.replace(/^\/|\/$/g, '')}/</span>}
          {v.plural && <span className="fr-meta text-muted">pl. {v.plural}</span>}
          {v.cefr && <span className="text-xs text-muted">{v.cefr}</span>}
          <span className="text-xs text-faint">{LEARN_STATUS_LABEL[v.status]}</span>
          {v.audioUrl && !isAudioFile(v.audioUrl) && <a className="text-xs text-accent underline" href={v.audioUrl} target="_blank" rel="noreferrer">{tr('发音链接')} ↗</a>}
        </div>
      </header>
      {(v.defEn || v.defZh) ? (
        <div className="space-y-1">
          {v.defEn && <p className="text-[17px]">{v.defEn}</p>}
          {v.defZh && <p className="text-muted">{v.defZh}</p>}
        </div>
      ) : <p className="text-sm text-faint">{tr('还没有释义。')}</p>}
      {v.examples.length > 0 && (
        <Section title={tr('例句')}>
          <ul className="space-y-3">
            {v.examples.map((e, i) => (
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
        </Section>
      )}
      {lists.filter(([, xs]) => xs.length).map(([t, xs]) => (
        <Section key={t} title={t}><p className="fr" lang="fr">{xs.join(' · ')}</p></Section>
      ))}
      {v.pos === 'verb' && (
        <Section title={tr('动词变位')}>
          {v.conjugation && <p className="text-sm">{v.conjugation}</p>}
          <a className="text-sm text-accent underline" href={`#/conjugation?v=${encodeURIComponent(v.lemma.trim())}`}>{tr('查看完整变位表 →')}</a>
        </Section>
      )}
      {v.topics.length > 0 && <Section title={tr('主题')}><p className="text-sm">{v.topics.map((t) => TOPIC_LABEL[t as keyof typeof TOPIC_LABEL] ?? t).join(' · ')}</p></Section>}
      {v.notes && <Section title={tr('个人笔记')}><p className="whitespace-pre-wrap text-sm">{v.notes}</p></Section>}
      <div className="flex justify-end border-t border-line pt-4">
        <Button kind="primary" onClick={onEdit}>{tr('编辑')}</Button>
      </div>
    </article>
  );
}

function VocabBatch({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState<Pos>('noun');
  return (
    <BatchAdd kind="vocab" onClose={onClose}
      parse={(l) => parseBatchLine(l, pos)}
      help={<>{tr('每行一个词：')}<span className="fr">{tr('法语 | 英文 | 中文')}</span>{tr('。名词带冠词（la scène）或阴阳性标注（l\'assiette (f.)、n.m.、[f]）都可以；没写阴阳性的名词可以在预览里直接选。')}</>}
      placeholder={tr('la scène | scene | 场景\nl\'huile (f.) | oil | 油\ntourner | to shoot | 拍摄')}
      extra={<Field label={tr('不带冠词的行默认词性')}><Select value={pos} onChange={(e) => setPos(e.target.value as Pos)} options={POS.map((p) => ({ value: p, label: POS_LABEL[p] }))} /></Field>}
    />
  );
}

export default function VocabPage() {
  const list = useLiveQuery(() => all<Vocab>('vocab'), []);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('');
  const [cefr, setCefr] = useState('');
  const [pos, setPos] = useState('');
  const [sort, setSort] = useState<'recent' | 'alpha' | 'cefr'>('recent');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? list?.find((x) => x.id === viewingId) : undefined;
  const [batch, setBatch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const ai = useAiConfig();
  const toast = useToast();
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const incomplete = (list ?? []).filter((v) => !v.defEn && !v.defZh);
  const bulkFill = async () => {
    if (!ai || !incomplete.length) return;
    let ok = 0;
    const errors: string[] = [];
    setBulk({ done: 0, total: incomplete.length });
    for (const [i, v] of incomplete.entries()) {
      try {
        const word = v.article ? (v.article.endsWith("'") ? `${v.article}${v.lemma}` : `${v.article} ${v.lemma}`) : v.lemma;
        const f = await aiFillVocab(word, ai, { posHint: v.pos });
        const { id, createdAt, updatedAt, deletedAt, rev, ...rest } = mergeFill({ ...v }, f);
        void createdAt; void updatedAt; void deletedAt; void rev;
        await saveVocab(id, { ...rest, lemma: v.lemma, article: v.article, pos: v.pos });
        ok++;
      } catch (e) {
        errors.push(trf('{0}：{1}', v.lemma, (e as Error).message));
        if (e instanceof AiError && e.fatal) break;
      }
      setBulk({ done: i + 1, total: incomplete.length });
    }
    setBulk(null);
    toast(errors.length ? trf('补全 {0} 个，失败 {1} 个：{2}', ok, errors.length, errors[0]) : trf('已补全 {0} 个词', ok), errors.length ? 'bad' : 'good');
  };

  const rows = useMemo(() => {
    if (!list) return [];
    const n = normalize(q);
    return list
      .filter((v) => !n || normalize(v.lemma).includes(n) || (v.defEn ?? '').toLowerCase().includes(n) || (v.defZh ?? '').includes(q.trim()))
      .filter((v) => !topic || v.topics.includes(topic))
      .filter((v) => !status || v.status === status)
      .filter((v) => !cefr || v.cefr === cefr)
      .filter((v) => !pos || v.pos === pos)
      .sort((a, b) => sort === 'alpha' ? normalize(a.lemma).localeCompare(normalize(b.lemma), 'fr') : sort === 'cefr' ? (a.cefr ?? 'Z').localeCompare(b.cefr ?? 'Z') : b.createdAt.localeCompare(a.createdAt));
  }, [list, q, topic, status, cefr, pos, sort]);

  return (
    <div>
      <KnowledgeTabs />
      <PageHeader title={tr('词汇')} sub={trf('{0} 个词条', list?.length ?? 0)} actions={<>
        {ai && incomplete.length > 0 && <Button onClick={bulkFill} disabled={!!bulk}>{bulk ? trf('补全中 {0}/{1}', bulk.done, bulk.total) : trf('AI 补全 {0} 个缺释义的词', incomplete.length)}</Button>}
        <Button onClick={() => setBatch(true)}>{tr('批量录入')}</Button>
        <Button kind="primary" onClick={() => setEditing({ ...emptyVocab() })}>{tr('＋ 新词')}</Button>
      </>} />
      <div className="mb-4 grid gap-2 md:grid-cols-6">
        <div className="flex gap-2 md:col-span-2">
          <Input placeholder={tr('搜索法语 / 英文 / 中文')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('搜索词汇')} />
          <Button className="shrink-0 whitespace-nowrap md:hidden" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>{tr('筛选')}{topic || pos || status || cefr ? ' ·' : ''}</Button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} gap-2 md:contents`}>
        <Select value={topic} onChange={(e) => setTopic(e.target.value)} options={[{ value: '', label: tr('全部主题') }, ...VOCAB_TOPICS.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))]} />
        <Select value={pos} onChange={(e) => setPos(e.target.value)} options={[{ value: '', label: tr('全部词性') }, ...POS.map((p) => ({ value: p, label: POS_LABEL[p] }))]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: tr('全部状态') }, ...LEARN_STATUS.map((s) => ({ value: s, label: LEARN_STATUS_LABEL[s] }))]} />
        <div className="flex gap-2">
          <Select value={cefr} onChange={(e) => setCefr(e.target.value)} options={[{ value: '', label: 'CEFR' }, ...CEFR_LEVELS.map((l) => ({ value: l, label: l }))]} />
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={tr('排序')} options={[{ value: 'recent', label: tr('最新') }, { value: 'alpha', label: 'A–Z' }, { value: 'cefr', label: tr('等级') }]} />
        </div>
        </div>
      </div>
      {list && list.length === 0 ? (
        <Empty>{tr('还没有词汇。点「＋ 新词」或用 AI 导入。')}</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((v) => (
            <li key={v.id} className="flex items-center hover:bg-paper">
              <SpeakButton size="sm" text={displayLemma(v)} audioUrl={v.audioUrl} className="ml-3" />
              <button className="flex min-w-0 flex-1 items-start justify-between gap-3 px-3 py-3 text-left" onClick={() => setViewingId(v.id)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="fr text-[21px]">{displayLemma(v)}</span>
                    <GramTag pos={v.pos} gender={v.gender} />
                  </div>
                  <div className="truncate text-sm text-muted">{[v.defEn, v.defZh].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {v.cefr && <span className="text-xs text-muted">{v.cefr}</span>}
                  <span className="text-xs text-faint">{LEARN_STATUS_LABEL[v.status]}</span>
                </div>
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-sm text-muted">{tr('没有符合条件的词条')}</li>}
        </ul>
      )}
      <Modal open={!!viewing && !editing} onClose={() => setViewingId(null)} title={tr('词条')} wide>
        {viewing && <VocabView v={viewing} onEdit={() => setEditing(viewing)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? tr('编辑词条') : tr('新词')} wide>
        {editing && <VocabEditor initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={batch} onClose={() => setBatch(false)} title={tr('批量录入')} wide>
        {batch && <VocabBatch onClose={() => setBatch(false)} />}
      </Modal>
    </div>
  );
}
