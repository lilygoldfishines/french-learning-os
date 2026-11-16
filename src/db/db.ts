import Dexie, { type Table } from 'dexie';
import type {
  Assessment, CardRecord, ErrorEntry, Expression, Goal, Grammar, Link, MetaRow, Retro, ReviewLog, Sentence, Session,
  SystemFields, TimeBlock, Vocab,
} from './types';
import { trf } from '../i18n';

export const SCHEMA_VERSION = 1;

export class FlosDB extends Dexie {
  vocab!: Table<Vocab, string>;
  grammar!: Table<Grammar, string>;
  expression!: Table<Expression, string>;
  sentence!: Table<Sentence, string>;
  error!: Table<ErrorEntry, string>;
  link!: Table<Link, string>;
  card!: Table<CardRecord, string>;
  reviewLog!: Table<ReviewLog, string>;
  goal!: Table<Goal, string>;
  timeBlock!: Table<TimeBlock, string>;
  session!: Table<Session, string>;
  assessment!: Table<Assessment, string>;
  retro!: Table<Retro, string>;
  meta!: Table<MetaRow, string>;
  syncState!: Table<SyncState, string>;
  conflicts!: Table<Conflict, string>;

  constructor(name = 'french-learning-os') {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      vocab: 'id, lemma, pos, cefr, status, *topics, updatedAt, deletedAt',
      grammar: 'id, name, cefr, category, updatedAt, deletedAt',
      expression: 'id, text, category, register, updatedAt, deletedAt',
      sentence: 'id, updatedAt, deletedAt',
      error: 'id, errorType, status, updatedAt, deletedAt',
      link: 'id, fromId, toId, updatedAt, deletedAt',
      card: 'id, itemId, [itemType+itemId], due, state, updatedAt, deletedAt',
      reviewLog: 'id, cardId, reviewedAt, updatedAt',
      goal: 'id, scope, period, updatedAt, deletedAt',
      timeBlock: 'id, weekStart, updatedAt, deletedAt',
      session: 'id, startedAt, updatedAt, deletedAt',
      assessment: 'id, skill, date, updatedAt, deletedAt',
      retro: 'id, [scope+period], updatedAt, deletedAt',
      meta: 'key',
    });
    // v2: sync bookkeeping (device-local, never exported or synced)
    this.version(2).stores({ syncState: 'key', conflicts: 'key' });
  }
}

/** Per record: the local rev and server version at the last successful sync. key = "<table>|<id>". */
export interface SyncState { key: string; localRev: number; version: number }
/** A record changed on this device and on another one since the last sync. */
export interface Conflict { key: string; tbl: TableName; id: string; local: SystemFields & Record<string, unknown>; remote: SystemFields & Record<string, unknown>; version: number; at: string }

export const TABLES = [
  'vocab', 'grammar', 'expression', 'sentence', 'error', 'link', 'card', 'reviewLog', 'goal', 'timeBlock', 'session',
  'assessment', 'retro',
] as const;
export type TableName = (typeof TABLES)[number];

export let db = new FlosDB();
/** Test hook: swap in a fresh database. */
export function useDatabase(next: FlosDB) {
  db = next;
}

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export function stamp<T extends object>(data: T): T & SystemFields {
  const t = nowIso();
  return { ...data, id: (data as Partial<SystemFields>).id ?? uid(), createdAt: t, updatedAt: t, deletedAt: null, rev: 1 };
}

type Rec = SystemFields & Record<string, unknown>;
function table(name: TableName): Table<Rec, string> {
  return (db as unknown as Record<string, Table<Rec, string>>)[name];
}

export async function insert<T extends object>(name: TableName, data: T): Promise<T & SystemFields> {
  const rec = stamp(data);
  await table(name).add(rec as unknown as Rec);
  return rec;
}

export async function update<T extends SystemFields>(name: TableName, id: string, patch: Partial<T>): Promise<void> {
  await db.transaction('rw', table(name), async () => {
    const cur = await table(name).get(id);
    if (!cur) throw new Error(trf('记录不存在: {0}/{1}', name, id));
    await table(name).put({ ...cur, ...patch, id, updatedAt: nowIso(), rev: (cur.rev ?? 0) + 1 } as Rec);
  });
}

/** Soft delete; also soft-deletes the item's review cards. */
export async function remove(name: TableName, id: string): Promise<void> {
  const t = nowIso();
  await db.transaction('rw', [table(name), db.card], async () => {
    const cur = await table(name).get(id);
    if (!cur) return;
    await table(name).put({ ...cur, deletedAt: t, updatedAt: t, rev: cur.rev + 1 });
    if (name !== 'card') {
      const cards = await db.card.where('itemId').equals(id).toArray();
      for (const c of cards) await db.card.put({ ...c, deletedAt: t, updatedAt: t, rev: c.rev + 1 });
    }
  });
}

export async function all<T>(name: TableName): Promise<T[]> {
  return (await table(name).toArray()).filter((r) => !r.deletedAt) as unknown as T[];
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
