import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { db, nowIso, stamp, uid } from './db/db';
import type { CardRecord, ItemType, Settings } from './db/types';
import { localDate } from './db/rules';
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
}

/** Build today's queue. Over-cap reviews are deferred, lowest-retrievability first is kept. */
export async function buildQueue(settings: Settings, now = new Date()): Promise<Queue> {
  const f = scheduler(settings.retention);
  const today = localDate(now);
  const cards = (await db.card.toArray()).filter((c) => !c.deletedAt && !c.suspended && c.itemType !== 'conj');
  const logsToday = (await db.reviewLog.where('reviewedAt').aboveOrEqual(new Date(`${today}T00:00:00`).toISOString()).toArray());
  const reviewedToday = logsToday.length;
  const newToday = new Set(logsToday.filter((l) => l.stateBefore === State.New).map((l) => l.cardId)).size;

  const dueAll = cards
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
  const newCap = Math.max(0, settings.dailyNewLimit - newToday);
  const fresh = cards
    .filter((c) => c.state === State.New)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, newCap);
  return { due, fresh, overdueDeferred: dueAll.length - due.length, reviewedToday, newToday };
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
