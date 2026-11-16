import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Grade } from 'ts-fsrs';
import { db } from '../db/db';
import { useSettings } from '../db/bootstrap';
import { buildQueue, grade, previewIntervals, Rating, type Queue } from '../srs';
import { displayLemma } from '../db/rules';
import { ERROR_TYPE_LABEL, type CardRecord, type ErrorEntry, type Expression, type Grammar, type Sentence, type Vocab } from '../db/types';
import { Button, Empty, GramTag, PageHeader } from '../ui/kit';
import { tr, trf } from '../i18n';
import { bilingualName } from '../i18n';

type Item = Vocab | Expression | Sentence | Grammar | ErrorEntry;

function Front({ card, item }: { card: CardRecord; item: Item }) {
  switch (card.itemType) {
    case 'vocab': {
      const v = item as Vocab;
      return <div className="fr text-[52px] leading-[1.05]">{displayLemma(v)}</div>;
    }
    case 'expression': return <div className="fr text-3xl">{(item as Expression).text}</div>;
    case 'sentence': return <div className="fr text-2xl leading-snug">{(item as Sentence).fr}</div>;
    case 'grammar': return <><div className="text-xs text-muted">{tr('语法 · 回忆规则和例句')}</div><div className="mt-2 text-2xl">{bilingualName((item as Grammar).name)}</div></>;
    case 'error': {
      const e = item as ErrorEntry;
      return <><div className="text-xs text-muted">{tr('改错 ·')} {ERROR_TYPE_LABEL[e.errorType]}</div><div className="fr mt-2 text-2xl">{e.original}</div></>;
    }
  }
}

function Back({ card, item }: { card: CardRecord; item: Item }) {
  switch (card.itemType) {
    case 'vocab': {
      const v = item as Vocab;
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-center gap-2">
            <GramTag pos={v.pos} gender={v.gender} />
            {v.ipa && <span className="fr-meta text-[15px] text-muted">/{v.ipa.replace(/^\/|\/$/g, '')}/</span>}
            {v.plural && <span className="fr-meta text-[15px] text-muted">pl. {v.plural}</span>}
          </div>
          <div className="mx-auto my-2 h-px w-10 bg-ink" />
          {v.defEn && <div className="text-[17px]">{v.defEn}</div>}
          {v.defZh && <div className="text-[15px] text-muted">{v.defZh}</div>}
          {v.examples[0] && <div className="fr mt-2 text-[17px] leading-relaxed italic">« {v.examples[0].fr} »</div>}
          {!v.defEn && !v.defZh && <div className="text-sm text-faint">{tr('还没有释义，可以去词汇库补全')}</div>}
        </div>
      );
    }
    case 'expression': {
      const x = item as Expression;
      return <div className="space-y-1">{x.defEn && <div className="text-lg">{x.defEn}</div>}{x.defZh && <div className="text-muted">{x.defZh}</div>}{x.examples[0] && <div className="fr text-[17px] italic">« {x.examples[0].fr} »</div>}</div>;
    }
    case 'sentence': {
      const s = item as Sentence;
      return <div className="space-y-1">{s.en && <div>{s.en}</div>}{s.zh && <div className="text-muted">{s.zh}</div>}</div>;
    }
    case 'grammar': {
      const g = item as Grammar;
      return <div className="space-y-1 text-left text-sm">{g.structure && <div className="fr">{g.structure}</div>}{g.explanationEn && <div>{g.explanationEn}</div>}{g.explanationZh && <div className="text-muted">{g.explanationZh}</div>}{g.correctExamples[0] && <div className="fr italic">{g.correctExamples[0]}</div>}</div>;
    }
    case 'error': {
      const e = item as ErrorEntry;
      return <div className="space-y-1"><div className="fr text-2xl text-good">{e.corrected}</div>{e.explanation && <div className="text-sm text-muted">{e.explanation}</div>}</div>;
    }
  }
}

const BUTTONS: { r: Grade; label: string; cls: string }[] = [
  { r: Rating.Again, label: tr('忘了'), cls: 'border-bad/40 text-bad' },
  { r: Rating.Hard, label: tr('困难'), cls: 'border-warn/40 text-warn' },
  { r: Rating.Good, label: tr('记得'), cls: 'border-ink bg-ink text-paper [&_div]:text-paper/70' },
  { r: Rating.Easy, label: tr('简单'), cls: 'border-accent/40 text-accent' },
];

export default function Review() {
  const settings = useSettings();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [current, setCurrent] = useState<{ card: CardRecord; item: Item } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  const load = useCallback(async () => {
    const q = await buildQueue(settings);
    setQueue(q);
    for (const card of [...q.due, ...q.fresh]) {
      const table = (db as unknown as Record<string, { get(id: string): Promise<Item | undefined> }>)[card.itemType];
      const item = await table.get(card.itemId);
      if (item && !item.deletedAt) { setCurrent({ card, item }); setFlipped(false); return; }
    }
    setCurrent(null);
  }, [settings]);

  useEffect(() => { load(); }, [load]);

  const rate = useCallback(async (r: Grade) => {
    if (!current) return;
    await grade(current.card.id, r, settings);
    setDone((d) => d + 1);
    await load();
  }, [current, settings, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === ' ') { e.preventDefault(); setFlipped(true); }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate]);

  if (!queue) return null;
  const remaining = queue.due.length + queue.fresh.length;
  const iv = current ? previewIntervals(current.card, settings.retention) : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={tr('复习')} eyebrow={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} sub={trf('本次已复习 {0} · 剩余 {1}（新卡 {2}）{3}', done, remaining, queue.fresh.length, queue.overdueDeferred ? trf(' · {0} 张顺延', queue.overdueDeferred) : '')} />
      {!current ? (
        <Empty>
          {tr('今天的复习完成了。')}{queue.overdueDeferred ? trf('还有 {0} 张积压会分到之后几天。', queue.overdueDeferred) : ''}
          <div className="mt-3"><Link to="/vocab" className="text-accent underline">{tr('去添加新词')}</Link></div>
        </Empty>
      ) : (
        <>
          <button
            onClick={() => setFlipped(true)}
            className="flex min-h-[46vh] w-full flex-col items-center justify-center rounded-md border border-line bg-panel p-6 text-center"
            aria-label={flipped ? tr('卡片背面') : tr('点击翻面')}
          >
            <Front card={current.card} item={current.item} />
            {flipped ? <div className="mt-6 w-full border-t border-line pt-6"><Back card={current.card} item={current.item} /></div> : <div className="mt-8 text-xs text-faint">{tr('点击或按空格翻面')}</div>}
          </button>
          <div className="sticky bottom-20 mt-4 md:bottom-4">
            {flipped ? (
              <div className="grid grid-cols-4 gap-2">
                {BUTTONS.map((b, i) => (
                  <button key={b.r} onClick={() => rate(b.r)} className={`rounded-md border border-line bg-panel py-3 text-sm ${b.cls}`}>
                    <div className="font-medium">{b.label}</div>
                    <div className="text-[11px] text-muted">{iv?.[b.r]}</div>
                    <div className="hidden text-[10px] text-faint md:block">{i + 1}</div>
                  </button>
                ))}
              </div>
            ) : (
              <Button kind="primary" className="w-full py-3 text-base" onClick={() => setFlipped(true)}>{tr('显示答案')}</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
