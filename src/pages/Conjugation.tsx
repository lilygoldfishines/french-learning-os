import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Grade } from 'ts-fsrs';
import { all, db, remove } from '../db/db';
import { useSettings } from '../db/bootstrap';
import { logError } from '../db/items';
import { buildConjQueue, ensureCard, grade, Rating } from '../srs';
import type { CardRecord, Vocab } from '../db/types';
import {
  checkAnswer, conjugate, DEFAULT_PRACTICE_TENSES, loadConjugator, PERSONS, STARTER_VERBS, TENSE_LABEL, TENSE_RULE, TENSES,
  type Form, type Tense, type TenseTable, type Verdict, type VerbTable,
} from '../conj/conjugate';
import { Button, Empty, Input, PageHeader, Section, cx, useToast } from '../ui/kit';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'œ', "'"];
const GROUP_LABEL = { 1: '第一组 -er', 2: '第二组 -ir（-issons）', 3: '第三组（不规则）' } as const;

export function TenseTableView({ table, highlight }: { table: TenseTable; highlight?: number }) {
  return (
    <table className="w-full text-[15px]">
      <tbody>
        {table.forms.map((f) => (
          <tr key={f.person} className={cx('border-b border-line last:border-0', highlight === f.person && 'bg-accent-soft')}>
            <td className="w-24 py-1 pr-2 text-muted">{table.tense === 'IMPERATIF_PRESENT' ? `(${PERSONS[f.person]})` : f.full.slice(0, f.full.length - f.form.length).trim()}</td>
            <td className={cx('fr py-1 text-[17px]', f.irregular && 'text-accent')}>{f.form}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccentKeys({ onKey }: { onKey: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="法语字母">
      {ACCENTS.map((c) => (
        <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(c)}
          className="fr h-9 min-w-9 rounded border border-line bg-panel px-2 text-[17px]">{c}</button>
      ))}
    </div>
  );
}

interface Q { card: CardRecord; verb: string; tense: Tense; table: TenseTable; form: Form; gloss?: string; group: 1 | 2 | 3 }

function Practice() {
  const settings = useSettings();
  const toast = useToast();
  const [q, setQ] = useState<Q | null | undefined>(undefined);
  const [counts, setCounts] = useState({ due: 0, fresh: 0, total: 0, doneToday: 0 });
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [logged, setLogged] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const next = useCallback(async () => {
    const queue = await buildConjQueue(settings);
    setCounts({ due: queue.due.length, fresh: queue.fresh.length, total: queue.total, doneToday: queue.doneToday });
    setAnswer(''); setVerdict(null); setLogged(false);
    for (const card of [...queue.due, ...queue.fresh]) {
      const [verb, tense] = card.itemId.split('|') as [string, Tense];
      const vt = await conjugate(verb, [tense]);
      const table = vt?.tables[0];
      if (!vt || !table) continue;
      const form = table.forms[Math.floor(Math.random() * table.forms.length)];
      const vocab = (await db.vocab.where('lemma').equals(vt.infinitive).first()) as Vocab | undefined;
      setQ({ card, verb: vt.verb, tense, table, form, gloss: vocab && !vocab.deletedAt ? vocab.defEn || vocab.defZh : undefined, group: vt.group });
      setTimeout(() => input.current?.focus(), 0);
      return;
    }
    setQ(null);
  }, [settings]);

  useEffect(() => { next(); }, [next]);

  const check = async () => {
    if (!q || verdict) return;
    const v = checkAnswer(answer, q.form);
    setVerdict(v);
    const r: Grade = v === 'correct' ? Rating.Good : v === 'accent' ? Rating.Hard : Rating.Again;
    await grade(q.card.id, r, settings);
  };
  const insertChar = (c: string) => {
    const el = input.current;
    if (!el) { setAnswer((a) => a + c); return; }
    const s = el.selectionStart ?? answer.length, e = el.selectionEnd ?? answer.length;
    const v = answer.slice(0, s) + c + answer.slice(e);
    setAnswer(v);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + c.length, s + c.length); });
  };

  if (q === undefined) return <Section title="练习"><p className="text-sm text-muted">正在载入变位数据…</p></Section>;
  if (q === null) {
    return (
      <Section title="练习" aside={<span className="text-xs text-muted">今天已练 {counts.doneToday}</span>}>
        <Empty>{counts.total ? '今天的变位练习完成了。' : '还没有要练的动词。在下面添加核心动词，或者把你词库里的动词加进来。'}</Empty>
      </Section>
    );
  }
  const label = TENSE_LABEL[q.tense];
  const person = q.tense === 'IMPERATIF_PRESENT' ? `(${PERSONS[q.form.person]})` : PERSONS[q.form.person];
  return (
    <Section title="练习" aside={<span className="text-xs text-muted">待练 {counts.due} · 新 {counts.fresh} · 今天已练 {counts.doneToday}</span>}>
      <div className="flex flex-col items-center gap-1 py-4 text-center">
        <div className="fr text-[44px] leading-tight">{q.verb}</div>
        {q.gloss && <div className="text-sm text-muted">{q.gloss}</div>}
        <div className="mt-2 text-[15px]">{label.zh} <span className="fr-meta text-muted">{label.fr}</span></div>
        <div className="fr mt-1 text-[26px]" data-person={person}>{person} <span className="text-faint" aria-hidden="true">…</span></div>
      </div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (verdict) next(); else check(); }}>
        <Input ref={input} lang="fr" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          aria-label="变位答案" className="fr text-center text-[22px]" value={answer} readOnly={!!verdict}
          onChange={(e) => setAnswer(e.target.value)} placeholder={q.tense === 'SUBJONCTIF_PRESENT' ? 'que …' : '…'} />
        {!verdict && <AccentKeys onKey={insertChar} />}
        {!verdict ? (
          <Button kind="primary" type="submit" className="w-full py-2.5" disabled={!answer.trim()}>检查</Button>
        ) : (
          <div className="space-y-3">
            <div role="status" className={cx('rounded-md p-3 text-center', verdict === 'correct' ? 'bg-[#e8f1ec] text-good' : verdict === 'accent' ? 'bg-[#fbf3e2] text-warn' : 'bg-[#f6e6e3] text-bad')}>
              <div className="font-medium">{verdict === 'correct' ? '正确' : verdict === 'accent' ? '差一点：注意重音' : '不对'}</div>
              <div className="fr mt-1 text-[20px] text-ink">{q.form.full}</div>
            </div>
            <div className="rounded-md border border-line bg-panel p-3">
              <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
                <span>{label.zh}{q.table.aux ? ` · 助动词 ${q.table.aux}` : ''}</span><span>{GROUP_LABEL[q.group]}</span>
              </div>
              <TenseTableView table={q.table} highlight={q.form.person} />
              <p className="mt-2 text-xs leading-relaxed text-muted">{TENSE_RULE[q.tense]}</p>
            </div>
            <div className="flex gap-2">
              {verdict !== 'correct' && (
                <Button type="button" disabled={logged} onClick={async () => {
                  await logError({ original: answer, corrected: q.form.full, errorType: 'conjugation', grammarRef: `${q.verb} · ${label.fr}`, source: '变位练习' }, { merge: true });
                  setLogged(true); toast('已记入错误库');
                }}>{logged ? '已记入错误库' : '记入错误库'}</Button>
              )}
              <Button kind="primary" type="submit" className="flex-1 py-2.5">下一个</Button>
            </div>
          </div>
        )}
      </form>
    </Section>
  );
}

function AddVerbs() {
  const toast = useToast();
  const [tenses, setTenses] = useState<Tense[]>(DEFAULT_PRACTICE_TENSES);
  const [one, setOne] = useState('');
  const [busy, setBusy] = useState(false);
  const state = useLiveQuery(async () => {
    const cards = (await db.card.where('[itemType+itemId]').between(['conj', ''], ['conj', '￿']).toArray()).filter((c) => !c.deletedAt);
    const verbs = new Map<string, number>();
    for (const c of cards) { const v = c.itemId.split('|')[0]; verbs.set(v, (verbs.get(v) ?? 0) + 1); }
    const mine = (await all<Vocab>('vocab')).filter((v) => v.pos === 'verb').map((v) => v.lemma.trim().toLowerCase());
    return { verbs, mine: [...new Set(mine)].filter((v) => !verbs.has(v)) };
  }, []);
  const add = async (list: string[]) => {
    setBusy(true);
    const unknown: string[] = [];
    let added = 0;
    for (const raw of list) {
      const vt = await conjugate(raw, tenses);
      if (!vt) { unknown.push(raw); continue; }
      for (const t of vt.tables) {
        const before = await db.card.where('[itemType+itemId]').equals(['conj', `${vt.verb}|${t.tense}`]).filter((c) => !c.deletedAt).count();
        await ensureCard('conj', `${vt.verb}|${t.tense}`);
        if (!before) added++;
      }
    }
    setBusy(false);
    toast(`新增 ${added} 张变位卡${unknown.length ? `；不认识：${unknown.join('、')}` : ''}`, unknown.length && !added ? 'bad' : 'good');
  };
  const toggle = (t: Tense) => setTenses((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  return (
    <Section title="添加练习">
      <div className="mb-3">
        <div className="mb-1 text-xs text-muted">练习哪些时态（每个动词 × 每个时态 = 一张卡）</div>
        <div className="flex flex-wrap gap-1.5">
          {TENSES.map((t) => (
            <button key={t} type="button" aria-pressed={tenses.includes(t)} onClick={() => toggle(t)}
              className={cx('rounded-md border px-2.5 py-1 text-sm', tenses.includes(t) ? 'border-ink bg-ink text-paper' : 'border-line bg-panel')}>
              {TENSE_LABEL[t].zh}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !tenses.length} onClick={() => add(STARTER_VERBS)}>添加 {STARTER_VERBS.length} 个核心动词</Button>
        {!!state?.mine.length && <Button disabled={busy || !tenses.length} onClick={() => add(state.mine)}>添加我词库里的 {state.mine.length} 个动词</Button>}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (one.trim()) { add([one]); setOne(''); } }}>
        <Input lang="fr" aria-label="添加一个动词" placeholder="添加一个动词，如 se souvenir" value={one} onChange={(e) => setOne(e.target.value)} />
        <Button type="submit" disabled={busy || !one.trim() || !tenses.length}>添加</Button>
      </form>
      {!!state?.verbs.size && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">正在练习 {state.verbs.size} 个动词</summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[...state.verbs.entries()].sort().map(([v, n]) => (
              <li key={v} className="fr inline-flex items-center gap-1 rounded border border-line bg-panel px-2 py-0.5 text-[15px]">
                {v} <span className="text-xs text-faint">{n}</span>
                <button aria-label={`移除 ${v}`} className="text-faint" onClick={async () => {
                  const cards = await db.card.where('[itemType+itemId]').between(['conj', `${v}|`], ['conj', `${v}|￿`]).toArray();
                  for (const c of cards) await remove('card', c.id);
                }}>×</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function Lookup() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('v') ?? '');
  const [res, setRes] = useState<VerbTable | null | undefined>(undefined);
  const run = useCallback(async (v: string) => { if (v.trim()) setRes(await conjugate(v)); }, []);
  useEffect(() => { const v = params.get('v'); if (v) run(v); }, [params, run]);
  return (
    <Section title="查变位">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setParams(q.trim() ? { v: q.trim() } : {}); run(q); }}>
        <Input lang="fr" aria-label="查变位" placeholder="输入动词不定式，如 prendre、se lever" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" disabled={!q.trim()}>查询</Button>
      </form>
      {res === null && <p className="mt-3 text-sm text-bad">没有找到这个动词。请输入不定式（如 prendre，不是 prends）。</p>}
      {res && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="fr text-[30px]">{res.verb}</span>
            <span className="text-sm text-muted">{GROUP_LABEL[res.group]}</span>
            {res.participle && <span className="fr-meta text-[15px] text-muted">p.p. {res.participle}</span>}
          </div>
          <p className="mb-3 text-xs text-muted">蓝色 = 和规则变位不同、需要特别记的形式（-er / -ir 动词对照规则词尾，第三组对照不定式词干）。</p>
          <div className="grid gap-4 md:grid-cols-2">
            {res.tables.map((t) => (
              <div key={t.tense} className="rounded-md border border-line bg-panel p-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm font-medium">{TENSE_LABEL[t.tense].zh} <span className="fr-meta font-normal text-muted">{TENSE_LABEL[t.tense].fr}</span></span>
                  {t.aux && <span className="text-xs text-muted">助动词 {t.aux}</span>}
                </div>
                <TenseTableView table={t} />
                <details className="mt-1"><summary className="cursor-pointer text-xs text-faint">规则速记</summary><p className="mt-1 text-xs leading-relaxed text-muted">{TENSE_RULE[t.tense]}</p></details>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

export default function ConjugationPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => { loadConjugator().then(() => setReady(true)); }, []);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="动词变位" sub="每个「动词 × 时态」是一张复习卡，按间隔重复安排；答错可以记入错误库" />
      {!ready ? <p className="text-sm text-muted">正在载入 7 千多个动词的变位数据（第一次需要联网，之后离线可用）…</p> : (
        <div className="space-y-4">
          <Practice />
          <AddVerbs />
          <Lookup />
        </div>
      )}
    </div>
  );
}
