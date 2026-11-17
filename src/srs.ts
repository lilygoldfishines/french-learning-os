import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { db, getMeta, nowIso, setMeta, stamp, uid } from './db/db';
import type { CardRecord, Grammar, ItemType, Settings } from './db/types';
import { grammarHasContent, localDate } from './db/rules';
import { trf } from './i18n';

export { Rating, State };

export function scheduler(retention: number) {
  return fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }));
}

export function toFsrs(c: CardRecord): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: 0,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  };
}

function fromFsrs(card: Card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function newCardRecord(itemType: ItemType, itemId: string, direction: CardRecord['direction'] = 'recognize', now = new Date()) {
  return stamp({ itemType, itemId, direction, suspended: false, ...fromFsrs(createEmptyCard(now)) }) as CardRecord;
}

export async function ensureCard(itemType: ItemType, itemId: string) {
  const existing = await db.card.where('[itemType+itemId]').equals([itemType, itemId]).first();
  if (existing && !existing.deletedAt) return existing;
  const rec = newCardRecord(itemType, itemId);
  await db.card.add(rec);
  return rec;
}

export interface Queue {
  due: CardRecord[];
  fresh: CardRecord[];
  overdueDeferred: number; // due cards beyond today's cap, spread to later days
  reviewedToday: number;
  newToday: number;
  /** new cards that exist but are held back by today's new-card limit */
  freshWaiting: number;
  newLimit: number;
}

const extraKey = (day: string) => `extraNew:${day}`;
/** "Learn N more today": raises today's new-card limit only. */
export async function allowMoreNewToday(n: number, now = new Date()) {
  const k = extraKey(localDate(now));
  await setMeta(k, (await getMeta<number>(k, 0)) + n);
}

/** Build today's queue. Over-cap reviews are deferred, lowest-retrievability first is kept. */
const LEARN_ORDER: ItemType[] = ['vocab', 'expression', 'sentence', 'grammar', 'error'];

/** New items take turns by kind (word, expression, sentence, grammar, error…), oldest first within each kind. */
export function interleaveByType<T extends { itemType: ItemType; createdAt: string }>(cards: T[]): T[] {
  const lanes = LEARN_ORDER.map((t) => cards.filter((c) => c.itemType === t).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  const out: T[] = [];
  for (let i = 0; out.length < cards.length && lanes.some((l) => l.length > i); i++) for (const l of lanes) if (l[i]) out.push(l[i]);
  return out;
}

export async function buildQueue(settings: Settings, now = new Date(), types?: ItemType[]): Promise<Queue> {
  const f = scheduler(settings.retention);
  const today = localDate(now);
  const allCards = await db.card.toArray();
  const cards = allCards.filter((c) => !c.deletedAt && !c.suspended && c.itemType !== 'conj');
  // conjugation practice has its own queue and limits: its reviews must not use up the main daily limits
  const conjIds = new Set(allCards.filter((c) => c.itemType === 'conj').map((c) => c.id));
  const logsToday = (await db.reviewLog.where('reviewedAt').aboveOrEqual(new Date(`${today}T00:00:00`).toISOString()).toArray())
    .filter((l) => !conjIds.has(l.cardId));
  const reviewedToday = logsToday.length;
  const newToday = new Set(logsToday.filter((l) => l.stateBefore === State.New).map((l) => l.cardId)).size;

  const dueAll = cards
    .filter((c) => !types || types.includes(c.itemType))
    .filter((c) => {
      if (c.state === State.New) return false;
      // learning-step cards due within 20 min are shown now, so a session can finish them
      const ahead = c.state === State.Learning || c.state === State.Relearning ? 20 * 60000 : 0;
      return Date.parse(c.due) <= now.getTime() + ahead;
    })
    .map((c) => ({ c, r: f.get_retrievability(toFsrs(c), now, false) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c);
  const reviewsDone = logsToday.filter((l) => l.stateBefore === State.Review).length;
  const reviewCap = Math.max(0, settings.dailyReviewLimit - reviewsDone);
  const due = dueAll.slice(0, reviewCap);
  const newLimit = settings.dailyNewLimit + (await getMeta<number>(extraKey(today), 0));
  const newCap = Math.max(0, newLimit - newToday);
  const allFresh = interleaveByType(cards.filter((c) => c.state === State.New));
  const fresh = allFresh.slice(0, newCap);
  return { due, fresh, overdueDeferred: dueAll.length - due.length, reviewedToday, newToday, freshWaiting: allFresh.length - fresh.length, newLimit };
}

export async function grade(cardId: string, rating: Grade, settings: Settings, now = new Date()) {
  const f = scheduler(settings.retention);
  await db.transaction('rw', db.card, db.reviewLog, async () => {
    const c = await db.card.get(cardId);
    if (!c) throw new Error('card not found');
    const res = f.next(toFsrs(c), now, rating);
    const t = nowIso();
    await db.card.put({ ...c, ...fromFsrs(res.card), updatedAt: t, rev: c.rev + 1 });
    await db.reviewLog.add({
      id: uid(), createdAt: t, updatedAt: t, deletedAt: null, rev: 1,
      cardId, rating, reviewedAt: now.toISOString(), stateBefore: c.state,
      scheduledDays: res.card.scheduled_days, elapsedDays: c.last_review ? (now.getTime() - Date.parse(c.last_review)) / 86400000 : 0,
    });
  });
}

/** Preview the next interval for each button, as a short label. */
export function previewIntervals(c: CardRecord, retention: number, now = new Date()) {
  const f = scheduler(retention);
  const p = f.repeat(toFsrs(c), now);
  const label = (d: Date) => {
    const mins = (d.getTime() - now.getTime()) / 60000;
    if (mins < 60) return trf('{0} 分钟', Math.max(1, Math.round(mins)));
    if (mins < 1440) return trf('{0} 小时', Math.round(mins / 60));
    const days = mins / 1440;
    if (days < 30) return trf('{0} 天', Math.round(days));
    if (days < 365) return trf('{0} 个月', Math.round(days / 30));
    return trf('{0} 年', (days / 365).toFixed(1));
  };
  return {
    [Rating.Again]: label(p[Rating.Again].card.due),
    [Rating.Hard]: label(p[Rating.Hard].card.due),
    [Rating.Good]: label(p[Rating.Good].card.due),
    [Rating.Easy]: label(p[Rating.Easy].card.due),
  } as Record<Grade, string>;
}

/** Conjugation practice queue: due verb×tense cards first (most overdue first), then new ones up to the daily cap. */
export async function buildConjQueue(settings: Settings, now = new Date()) {
  const cards = (await db.card.where('[itemType+itemId]').between(['conj', ''], ['conj', '\uffff']).toArray()).filter((c) => !c.deletedAt && !c.suspended);
  const today = localDate(now);
  const ids = new Set(cards.map((c) => c.id));
  const logsToday = (await db.reviewLog.where('reviewedAt').aboveOrEqual(new Date(`${today}T00:00:00`).toISOString()).toArray()).filter((l) => ids.has(l.cardId));
  const newToday = new Set(logsToday.filter((l) => l.stateBefore === State.New).map((l) => l.cardId)).size;
  const due = cards
    .filter((c) => c.state !== State.New && Date.parse(c.due) <= now.getTime() + (c.state === State.Review ? 0 : 20 * 60000))
    .sort((a, b) => a.due.localeCompare(b.due));
  const fresh = cards.filter((c) => c.state === State.New).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, Math.max(0, settings.conjNewLimit - newToday));
  return { due, fresh, total: cards.length, doneToday: logsToday.length };
}

/** Something to learn for the first time: a new card, or a grammar point with content that has no card yet. */
export interface LearnEntry { itemType: ItemType; itemId: string; cardId?: string; createdAt: string }
export interface LearnQueue { entries: LearnEntry[]; waiting: number; newToday: number; newLimit: number; byType: Partial<Record<ItemType, number>> }

/** A grammar point is worth learning once it has something to learn from, and isn't marked as known. */
export const grammarLearnable = (g: Grammar) => !g.deletedAt && !g.skipped && g.mastery < 3 && grammarHasContent(g);

export async function buildLearnQueue(settings: Settings, types?: ItemType[], now = new Date()): Promise<LearnQueue> {
  const q = await buildQueue(settings, now);
  const all = await db.card.toArray();
  const live = all.filter((c) => !c.deletedAt && !c.suspended && c.itemType !== 'conj');
  const fresh: LearnEntry[] = live.filter((c) => c.state === State.New).map((c) => ({ itemType: c.itemType, itemId: c.itemId, cardId: c.id, createdAt: c.createdAt }));
  const carded = new Set(all.filter((c) => c.itemType === 'grammar' && !c.deletedAt).map((c) => c.itemId));
  const grammar = (await db.grammar.toArray()).filter((g) => grammarLearnable(g) && !carded.has(g.id))
    .map((g): LearnEntry => ({ itemType: 'grammar', itemId: g.id, createdAt: g.createdAt }));
  const candidates = [...fresh, ...grammar];
  const byType: Partial<Record<ItemType, number>> = {};
  for (const e of candidates) byType[e.itemType] = (byType[e.itemType] ?? 0) + 1;
  const picked = interleaveByType(candidates.filter((e) => !types || types.includes(e.itemType)));
  const cap = Math.max(0, q.newLimit - q.newToday);
  return { entries: picked.slice(0, cap), waiting: Math.max(0, picked.length - cap), newToday: q.newToday, newLimit: q.newLimit, byType };
}

/** First study of an item: Good = learnt (short re-check later today), Easy = already known (long interval). */
export async function learn(entry: LearnEntry, rating: Grade, settings: Settings) {
  const id = entry.cardId ?? (await ensureCard(entry.itemType, entry.itemId)).id;
  await grade(id, rating, settings);
}
