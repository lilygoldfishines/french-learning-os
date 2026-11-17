import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { useSettings } from '../db/bootstrap';
import { allowMoreNewToday, buildLearnQueue, learn, Rating, type LearnEntry, type LearnQueue } from '../srs';
import { ERROR_TYPE_LABEL, type ErrorEntry, type Expression, type Grammar, type Sentence, type Vocab } from '../db/types';
import { KIND_LABEL } from '../io/aiImport';
import { Button, Empty, PageHeader } from '../ui/kit';
import { TypeFilter, useTypeChoice } from '../features/TypeFilter';
import { Para, ReadSection } from '../features/ReadView';
import { VocabView } from './Vocab';
import { ExpressionView } from './Expressions';
import { SentenceView } from './Sentences';
import { GrammarView } from './Grammar';
import { tr, trf } from '../i18n';

type Item = Vocab | Expression | Sentence | Grammar | ErrorEntry;

function ErrorView({ e }: { e: ErrorEntry }) {
  return (
    <article className="space-y-4">
      <div className="text-xs text-muted">{ERROR_TYPE_LABEL[e.errorType]}</div>
      <p className="fr text-bad line-through decoration-1" lang="fr">{e.original}</p>
      <p className="fr text-[24px] text-good" lang="fr">{e.corrected}</p>
      <ReadSection title={tr('解释')} show={!!e.explanation}><Para>{e.explanation}</Para></ReadSection>
      <ReadSection title={tr('相关语法点')} show={!!e.grammarRef}><Para>{e.grammarRef}</Para></ReadSection>
    </article>
  );
}

function StudyItem({ entry, item }: { entry: LearnEntry; item: Item }) {
  switch (entry.itemType) {
    case 'vocab': return <VocabView v={item as Vocab} />;
    case 'expression': return <ExpressionView x={item as Expression} />;
    case 'sentence': return <SentenceView s={item as Sentence} />;
    case 'grammar': return <GrammarView g={item as Grammar} />;
    case 'error': return <ErrorView e={item as ErrorEntry} />;
    default: return null;
  }
}

export default function Learn() {
  const settings = useSettings();
  const [type, setType, types] = useTypeChoice('learn');
  const [queue, setQueue] = useState<LearnQueue | null>(null);
  const [current, setCurrent] = useState<{ entry: LearnEntry; item: Item } | null>(null);
  const [later, setLater] = useState<string[]>([]); // "see it later" within this visit
  const [done, setDone] = useState(0);

  const load = useCallback(async () => {
    const q = await buildLearnQueue(settings, types);
    setQueue(q);
    const key = (e: LearnEntry) => `${e.itemType}:${e.itemId}`;
    const order = [...q.entries.filter((e) => !later.includes(key(e))), ...q.entries.filter((e) => later.includes(key(e)))];
    for (const entry of order) {
      const table = (db as unknown as Record<string, { get(id: string): Promise<Item | undefined> }>)[entry.itemType];
      const item = await table.get(entry.itemId);
      if (item && !item.deletedAt) { setCurrent({ entry, item }); window.scrollTo?.(0, 0); return; }
    }
    setCurrent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, type, later]);

  useEffect(() => { load(); }, [load]);

  const act = async (r: typeof Rating.Good | typeof Rating.Easy) => {
    if (!current) return;
    await learn(current.entry, r, settings);
    setDone((d) => d + 1);
    await load();
  };
  const skip = () => current && setLater((l) => [...l.filter((k) => k !== `${current.entry.itemType}:${current.entry.itemId}`), `${current.entry.itemType}:${current.entry.itemId}`]);

  if (!queue) return null;
  const left = Math.max(0, queue.newLimit - queue.newToday);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={tr('学习')} eyebrow={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        sub={trf('第一次学的新内容 · 今天已学 {0} / {1}', queue.newToday, queue.newLimit)} />
      <TypeFilter value={type} onChange={(v) => { setType(v); setLater([]); }} counts={queue.byType} />
      {!current ? (
        <Empty>
          {queue.waiting > 0 && left === 0 ? (
            <div className="space-y-3">
              <p>{trf('今天的新内容上限（{0} 个）已经学完，还有 {1} 个在排队。', queue.newLimit, queue.waiting)}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button kind="primary" onClick={async () => { await allowMoreNewToday(Math.min(5, queue.waiting)); await load(); }}>
                  {trf('今天再学 {0} 个', Math.min(5, queue.waiting))}
                </Button>
                <Link to="/settings" className="self-center text-sm text-accent underline">{tr('调整每日上限')}</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p>{type ? trf('没有要学的{0}了。', KIND_LABEL[type]) : tr('没有新内容要学了。')}</p>
              {(!type || type === 'grammar') && <p className="text-sm">{tr('内置语法点要先补充结构、解释或例句，才会出现在这里。')}</p>}
              <p><Link to="/vocab" className="text-accent underline">{tr('去知识库添加')}</Link></p>
            </div>
          )}
          {done > 0 && <p className="mt-4">{trf('这次学了 {0} 个，它们稍后会出现在', done)}<Link to="/review" className="text-accent underline">{tr('复习')}</Link>{tr('里。')}</p>}
        </Empty>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>{KIND_LABEL[current.entry.itemType as keyof typeof KIND_LABEL]} · {tr('新')}</span>
            <span>{trf('还有 {0} 个', queue.entries.length)}</span>
          </div>
          <div className="rounded-md border border-line bg-panel p-5" data-testid="learn-card">
            <StudyItem entry={current.entry} item={current.item} />
          </div>
          <div className="sticky bottom-20 mt-4 space-y-2 md:bottom-4">
            <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
              <button onClick={skip} className="rounded-md border border-line bg-panel py-3 text-sm text-muted">{tr('稍后再看')}</button>
              <button onClick={() => act(Rating.Easy)} className="rounded-md border border-line bg-panel py-3 text-sm text-accent">{tr('我已经会了')}</button>
              <button onClick={() => act(Rating.Good)} className="rounded-md border border-ink bg-ink py-3 text-sm font-medium text-paper">{tr('学会了')}</button>
            </div>
            <p className="text-center text-[11px] text-faint">{tr('「学会了」：稍后在复习里再考一次；「我已经会了」：很久以后才复习。')}</p>
          </div>
        </>
      )}
    </div>
  );
}
