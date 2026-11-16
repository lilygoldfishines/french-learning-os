import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, remove } from '../db/db';
import { addVocab, emptyVocab, saveVocab, ValidationError } from '../db/items';
import { displayLemma, normalize } from '../db/rules';
import {
  CEFR_LEVELS, LEARN_STATUS, LEARN_STATUS_LABEL, POS, POS_LABEL, TOPIC_LABEL, VOCAB_TOPICS, type Gender, type Pos, type Vocab,
} from '../db/types';
import { Button, GramTag, Empty, Field, Input, Modal, PageHeader, Select, TagsInput, Textarea, useToast } from '../ui/kit';
import { GenderPicker } from '../features/QuickAdd';
import { ExamplesEditor } from '../features/ListEditors';
import ImportPreview from '../features/ImportPreview';
import { buildPreview, type PreviewRow } from '../io/aiImport';
import { aiFillVocab, AiError, mergeFill, useAiConfig } from '../ai/fill';
import { KnowledgeTabs } from './More';

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
      toast('已补全空白字段');
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
      toast('已保存');
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) {
        setProblems(e.problems);
        setDup(e.message.startsWith('可能重复'));
      } else setProblems([(e as Error).message]);
    }
  };
  return (
    <div className="space-y-4">
      {ai && (
        <div className="flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-sm">
          <span className="text-muted">只填空白字段，不会覆盖你已经写的内容</span>
          <Button disabled={!v.lemma.trim() || busy} onClick={runAi}>{busy ? '查询中…' : 'AI 补全'}</Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[6rem_1fr_10rem]">
        <Field label="冠词"><Input lang="fr" className="fr" value={v.article ?? ''} onChange={(e) => set('article', e.target.value)} placeholder="le / la / l'" /></Field>
        <Field label="法语词条 *"><Input lang="fr" className="fr text-lg" value={v.lemma} onChange={(e) => set('lemma', e.target.value)} /></Field>
        <Field label="词性 *"><Select value={v.pos} onChange={(e) => set('pos', e.target.value as Pos)} options={POS.map((p) => ({ value: p, label: POS_LABEL[p] }))} /></Field>
      </div>
      {v.pos === 'noun' && <Field group label="阴阳性 *"><GenderPicker value={v.gender} onChange={(g) => set('gender', g)} /></Field>}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="复数"><Input lang="fr" value={v.plural ?? ''} onChange={(e) => set('plural', e.target.value)} /></Field>
        <Field label="IPA 音标"><Input value={v.ipa ?? ''} onChange={(e) => set('ipa', e.target.value)} /></Field>
        <Field label="发音链接"><Input type="url" value={v.audioUrl ?? ''} onChange={(e) => set('audioUrl', e.target.value)} placeholder="如 Forvo 链接" /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="英文释义"><Textarea rows={2} value={v.defEn ?? ''} onChange={(e) => set('defEn', e.target.value)} /></Field>
        <Field label="中文解释"><Textarea rows={2} value={v.defZh ?? ''} onChange={(e) => set('defZh', e.target.value)} /></Field>
      </div>
      <Field group label="例句"><ExamplesEditor value={v.examples} onChange={(x) => set('examples', x)} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field group label="同义词"><TagsInput label="同义词" value={v.synonyms} onChange={(x) => set('synonyms', x)} /></Field>
        <Field group label="反义词"><TagsInput label="反义词" value={v.antonyms} onChange={(x) => set('antonyms', x)} /></Field>
        <Field group label="相关词汇"><TagsInput label="相关词汇" value={v.related} onChange={(x) => set('related', x)} /></Field>
        <Field group label="常见搭配"><TagsInput label="常见搭配" value={v.collocations} onChange={(x) => set('collocations', x)} /></Field>
        <Field group label="常见介词"><TagsInput label="常见介词" value={v.prepositions} onChange={(x) => set('prepositions', x)} placeholder="à, de, sur…" /></Field>
        {v.pos === 'verb' && v.lemma.trim() && <div className="flex items-end"><a className="text-sm text-accent underline" href={`#/conjugation?v=${encodeURIComponent(v.lemma.trim())}`}>查看完整变位表 →</a></div>}
        {v.pos === 'verb' && <Field label="动词变位要点"><Input value={v.conjugation ?? ''} onChange={(e) => set('conjugation', e.target.value)} placeholder="如：3e groupe, pp. pris" /></Field>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="主题">
          <Select multiple className="h-28" value={v.topics} onChange={(e) => set('topics', Array.from(e.target.selectedOptions).map((o) => o.value))}
            options={VOCAB_TOPICS.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))} />
        </Field>
        <Field label="CEFR"><Select value={v.cefr ?? ''} onChange={(e) => set('cefr', (e.target.value || undefined) as Vocab['cefr'])} options={[{ value: '', label: '—' }, ...CEFR_LEVELS.map((l) => ({ value: l, label: l }))]} /></Field>
        <Field label="学习状态"><Select value={v.status} onChange={(e) => set('status', e.target.value as Vocab['status'])} options={LEARN_STATUS.map((s) => ({ value: s, label: LEARN_STATUS_LABEL[s] }))} /></Field>
      </div>
      <Field label="个人笔记"><Textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {problems.length > 0 && <div className="text-sm text-bad">{problems.join('；')}</div>}
      <div className="flex justify-between gap-2">
        <div>{v.id && <Button kind="danger" onClick={async () => { if (confirm('删除这个词条？')) { await remove('vocab', v.id!); onClose(); } }}>删除</Button>}</div>
        <div className="flex gap-2">
          {dup && <Button onClick={() => save(true)}>仍然保存为新词条</Button>}
          <Button onClick={onClose}>取消</Button>
          <Button kind="primary" onClick={() => save()}>保存</Button>
        </div>
      </div>
    </div>
  );
}

function BatchAdd({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [pos, setPos] = useState<Pos>('noun');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const parse = async () => {
    const items = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [fr, en, zh] = l.split(/\s*[|;；\t]\s*/);
      const hasArticle = /^(le|la|l'|l’|les)\s*/i.test(fr);
      return { kind: 'vocab' as const, raw: { lemma: fr, pos: hasArticle ? 'noun' : pos, defEn: en, defZh: zh } };
    });
    setRows(await buildPreview(items));
  };
  if (rows) return <ImportPreview rows={rows} onDone={(r) => { toast(`导入 ${r.added} 条，跳过 ${r.skipped} 条`); onClose(); }} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">每行一个词：<span className="fr">法语 | 英文 | 中文</span>。名词请带冠词（如 la scène），系统会据此判断阴阳性；l' 开头的名词会被标为格式错误，导入后需手动补阴阳性。</p>
      <Textarea rows={8} lang="fr" className="fr" value={text} onChange={(e) => setText(e.target.value)} placeholder={'la scène | scene | 场景\nle cadrage | framing | 构图\ntourner | to shoot | 拍摄'} />
      <Field label="不带冠词的行默认词性"><Select value={pos} onChange={(e) => setPos(e.target.value as Pos)} options={POS.map((p) => ({ value: p, label: POS_LABEL[p] }))} /></Field>
      <Button kind="primary" onClick={parse} disabled={!text.trim()}>预览</Button>
    </div>
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
        errors.push(`${v.lemma}：${(e as Error).message}`);
        if (e instanceof AiError && /密钥|余额|离线|连接/.test(e.message)) break;
      }
      setBulk({ done: i + 1, total: incomplete.length });
    }
    setBulk(null);
    toast(errors.length ? `补全 ${ok} 个，失败 ${errors.length} 个：${errors[0]}` : `已补全 ${ok} 个词`, errors.length ? 'bad' : 'good');
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
      <PageHeader title="词汇" sub={`${list?.length ?? 0} 个词条`} actions={<>
        {ai && incomplete.length > 0 && <Button onClick={bulkFill} disabled={!!bulk}>{bulk ? `补全中 ${bulk.done}/${bulk.total}` : `AI 补全 ${incomplete.length} 个缺释义的词`}</Button>}
        <Button onClick={() => setBatch(true)}>批量录入</Button>
        <Button kind="primary" onClick={() => setEditing({ ...emptyVocab() })}>＋ 新词</Button>
      </>} />
      <div className="mb-4 grid gap-2 md:grid-cols-6">
        <div className="flex gap-2 md:col-span-2">
          <Input placeholder="搜索法语 / 英文 / 中文" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索词汇" />
          <Button className="shrink-0 whitespace-nowrap md:hidden" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>筛选{topic || pos || status || cefr ? ' ·' : ''}</Button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} gap-2 md:contents`}>
        <Select value={topic} onChange={(e) => setTopic(e.target.value)} options={[{ value: '', label: '全部主题' }, ...VOCAB_TOPICS.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))]} />
        <Select value={pos} onChange={(e) => setPos(e.target.value)} options={[{ value: '', label: '全部词性' }, ...POS.map((p) => ({ value: p, label: POS_LABEL[p] }))]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: '全部状态' }, ...LEARN_STATUS.map((s) => ({ value: s, label: LEARN_STATUS_LABEL[s] }))]} />
        <div className="flex gap-2">
          <Select value={cefr} onChange={(e) => setCefr(e.target.value)} options={[{ value: '', label: 'CEFR' }, ...CEFR_LEVELS.map((l) => ({ value: l, label: l }))]} />
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="排序" options={[{ value: 'recent', label: '最新' }, { value: 'alpha', label: 'A–Z' }, { value: 'cefr', label: '等级' }]} />
        </div>
        </div>
      </div>
      {list && list.length === 0 ? (
        <Empty>还没有词汇。点「＋ 新词」或用 AI 导入。</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((v) => (
            <li key={v.id}>
              <button className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-paper" onClick={() => setEditing(v)}>
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
          {rows.length === 0 && <li className="p-6 text-center text-sm text-muted">没有符合条件的词条</li>}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? '编辑词条' : '新词'} wide>
        {editing && <VocabEditor initial={editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={batch} onClose={() => setBatch(false)} title="批量录入" wide>
        {batch && <BatchAdd onClose={() => setBatch(false)} />}
      </Modal>
    </div>
  );
}
