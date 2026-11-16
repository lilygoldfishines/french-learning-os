import type { Table } from 'dexie';
import { db, getMeta, setMeta, TABLES, type Conflict, type SyncState, type TableName } from '../db/db';
import type { SystemFields } from '../db/types';

/**
 * Local-first sync against a server that keeps one row per (user, table, id) with a server version.
 * - Pull: rows changed on the server since our cursor. A record unchanged here is replaced; a record changed on
 *   both sides becomes a Conflict for the learner to resolve (or, for machine-written tables, newest wins).
 * - Push: records whose rev moved since the last sync, with the server version we last saw as `base`.
 *   The server only applies the write if its version still equals `base`, so nothing is silently overwritten.
 */
export interface RemoteRow { tbl: TableName; id: string; data: Rec; deleted: boolean; version: number; server_updated_at: string }
export interface PushItem { tbl: TableName; id: string; data: Rec; deleted: boolean; base: number | null }
export interface Remote {
  pull(sinceIso: string, limit: number): Promise<RemoteRow[]>;
  push(items: PushItem[]): Promise<{ tbl: string; id: string; version: number | null }[]>;
  get(tbl: TableName, id: string): Promise<RemoteRow | null>;
}
type Rec = SystemFields & Record<string, unknown>;

/** Tables written by the app itself (scheduler, logs, timers): on a double edit the newer copy wins, no prompt. */
const AUTO_RESOLVE = new Set<TableName>(['card', 'reviewLog', 'session', 'timeBlock']);
const SYSTEM = new Set(['createdAt', 'updatedAt', 'rev']);
const CURSOR = 'syncCursor';
const OVERLAP_MS = 5000; // re-read a few seconds back so rows committed slightly out of order are not missed

let applyingRemote = false;
export const isApplyingRemote = () => applyingRemote;

const tbl = (name: TableName) => (db as unknown as Record<TableName, Table<Rec, string>>)[name];
const keyOf = (t: string, id: string) => `${t}|${id}`;

function sameContent(a: Rec, b: Rec): boolean {
  const strip = (r: Rec) => JSON.stringify(Object.keys(r).filter((k) => !SYSTEM.has(k)).sort().map((k) => [k, r[k] ?? null]));
  return strip(a) === strip(b);
}

async function accept(row: RemoteRow) {
  applyingRemote = true;
  try {
    await tbl(row.tbl).put(row.data);
  } finally {
    applyingRemote = false;
  }
  await db.syncState.put({ key: keyOf(row.tbl, row.id), localRev: row.data.rev, version: row.version });
}

/** Apply one server row. Returns 'conflict' when the learner has to choose. */
async function applyRow(row: RemoteRow): Promise<'applied' | 'skipped' | 'conflict' | 'kept-local'> {
  if (!TABLES.includes(row.tbl)) return 'skipped';
  const key = keyOf(row.tbl, row.id);
  const st = await db.syncState.get(key);
  if (st && st.version >= row.version) return 'skipped';
  const local = await tbl(row.tbl).get(row.id);
  const localChanged = !!local && (!st || local.rev !== st.localRev);
  if (!local || !localChanged || sameContent(local, row.data)) {
    await accept(row);
    return 'applied';
  }
  if (AUTO_RESOLVE.has(row.tbl)) {
    if (String(row.data.updatedAt) >= String(local.updatedAt)) {
      await accept(row);
      return 'applied';
    }
    // keep ours; next push uses the new base so it can overwrite
    await db.syncState.put({ key, localRev: st?.localRev ?? -1, version: row.version });
    return 'kept-local';
  }
  await db.conflicts.put({ key, tbl: row.tbl, id: row.id, local, remote: row.data, version: row.version, at: new Date().toISOString() } satisfies Conflict);
  return 'conflict';
}

export async function pendingCount(): Promise<number> {
  const [states, conflicts] = await Promise.all([db.syncState.toArray(), db.conflicts.toArray()]);
  const map = new Map(states.map((s) => [s.key, s]));
  const blocked = new Set(conflicts.map((c) => c.key));
  let n = 0;
  for (const t of TABLES) {
    for (const r of await tbl(t).toArray()) {
      const k = keyOf(t, r.id);
      if (blocked.has(k)) continue;
      const s = map.get(k);
      if (!s || s.localRev !== r.rev) n++;
    }
  }
  return n;
}

export interface SyncReport { pulled: number; pushed: number; conflicts: number; keptLocal: number }

export async function syncOnce(remote: Remote, opts: { batch?: number } = {}): Promise<SyncReport> {
  const batch = opts.batch ?? 500;
  const rep: SyncReport = { pulled: 0, pushed: 0, conflicts: 0, keptLocal: 0 };

  // ---- pull ----
  let cursor = await getMeta<string>(CURSOR, '1970-01-01T00:00:00.000Z');
  for (;;) {
    const since = new Date(Math.max(0, Date.parse(cursor) - OVERLAP_MS)).toISOString();
    const rows = await remote.pull(since, batch);
    let advanced = false;
    for (const r of rows) {
      const res = await applyRow(r);
      if (res === 'applied') rep.pulled++;
      if (res === 'conflict') rep.conflicts++;
      if (res === 'kept-local') rep.keptLocal++;
      if (r.server_updated_at > cursor) { cursor = r.server_updated_at; advanced = true; }
    }
    await setMeta(CURSOR, cursor);
    if (rows.length < batch || !advanced) break;
  }

  // ---- push ----
  const states = new Map((await db.syncState.toArray()).map((s) => [s.key, s]));
  const blocked = new Set((await db.conflicts.toArray()).map((c) => c.key));
  const items: PushItem[] = [];
  const revs = new Map<string, number>();
  for (const t of TABLES) {
    for (const r of await tbl(t).toArray()) {
      const k = keyOf(t, r.id);
      if (blocked.has(k)) continue;
      const s = states.get(k);
      if (s && s.localRev === r.rev) continue;
      items.push({ tbl: t, id: r.id, data: r, deleted: !!r.deletedAt, base: s ? s.version : null });
      revs.set(k, r.rev);
    }
  }
  for (let i = 0; i < items.length; i += batch) {
    const results = await remote.push(items.slice(i, i + batch));
    for (const res of results) {
      const k = keyOf(res.tbl, res.id);
      if (res.version !== null) {
        await db.syncState.put({ key: k, localRev: revs.get(k)!, version: res.version } satisfies SyncState);
        rep.pushed++;
      } else {
        // someone else wrote it first: bring their copy in and decide like a pull
        const row = await remote.get(res.tbl as TableName, res.id);
        if (row) {
          const r = await applyRow(row);
          if (r === 'conflict') rep.conflicts++;
          if (r === 'applied') rep.pulled++;
        }
      }
    }
  }
  await setMeta('lastSyncAt', new Date().toISOString());
  return rep;
}

export async function resolveConflict(key: string, keep: 'local' | 'remote') {
  const c = await db.conflicts.get(key);
  if (!c) return;
  if (keep === 'remote') {
    applyingRemote = true;
    try { await tbl(c.tbl).put(c.remote); } finally { applyingRemote = false; }
    await db.syncState.put({ key, localRev: c.remote.rev, version: c.version });
  } else {
    // keep ours, and mark it as changed relative to the server copy so the next push overwrites it
    const cur = await tbl(c.tbl).get(c.id);
    await db.syncState.put({ key, localRev: cur ? cur.rev - 1 : -1, version: c.version });
  }
  await db.conflicts.delete(key);
}

/** After signing out or switching account: forget sync bookkeeping (local data stays). */
export async function resetSyncState() {
  await db.syncState.clear();
  await db.conflicts.clear();
  await db.meta.delete(CURSOR);
  await db.meta.delete('lastSyncAt');
}
