import { describe, expect, it } from 'vitest';
import { all, db, FlosDB, insert, remove, update, useDatabase } from '../db/db';
import { addVocab, emptyVocab, saveVocab } from '../db/items';
import { bootstrap, normalizeSeedIds, seedId } from '../db/bootstrap';
import { pendingCount, resolveConflict, syncOnce, type PushItem, type Remote, type RemoteRow } from './engine';
import { grade, Rating } from '../srs';
import { DEFAULT_SETTINGS, type Grammar, type Vocab } from '../db/types';

/** In-memory twin of public.records + sync_push (same version rules as the SQL, verified separately). */
class FakeServer implements Remote {
  rows = new Map<string, RemoteRow>();
  clock = Date.parse('2026-11-17T00:00:00Z');
  private stamp() { this.clock += 1000; return new Date(this.clock).toISOString(); }
  async pull(since: string, limit: number) {
    return [...this.rows.values()].filter((r) => r.server_updated_at > since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)).slice(0, limit).map((r) => structuredClone(r));
  }
  async get(tbl: RemoteRow['tbl'], id: string) { const r = this.rows.get(`${tbl}|${id}`); return r ? structuredClone(r) : null; }
  async push(items: PushItem[]) {
    return items.map((it) => {
      const k = `${it.tbl}|${it.id}`;
      const cur = this.rows.get(k);
      let version: number | null = null;
      if (it.base === null) {
        if (!cur) { version = 1; this.rows.set(k, { tbl: it.tbl, id: it.id, data: structuredClone(it.data), deleted: it.deleted, version, server_updated_at: this.stamp() }); }
      } else if (cur && cur.version === it.base) {
        version = cur.version + 1;
        this.rows.set(k, { ...cur, data: structuredClone(it.data), deleted: it.deleted, version, server_updated_at: this.stamp() });
      }
      return { tbl: it.tbl, id: it.id, version };
    });
  }
}

const noun = (lemma: string, gender: 'm' | 'f') => ({ ...emptyVocab(), lemma, gender, article: gender === 'm' ? 'le' : 'la', pos: 'noun' as const });
let n = 0;
function devices() {
  const A = new FlosDB(`syncA-${++n}`), B = new FlosDB(`syncB-${n}`);
  const on = async <T>(d: FlosDB, fn: () => Promise<T>) => { useDatabase(d); return fn(); };
  return { A, B, on, server: new FakeServer() };
}

describe('sync between two devices', () => {
  it('copies new records, edits and deletions both ways; seeds do not duplicate', async () => {
    const { A, B, on, server } = devices();
    await on(A, bootstrap);
    await on(B, bootstrap);
    const v = await on(A, () => addVocab({ ...noun('scène', 'f'), defEn: 'scene' }));
    const repA = await on(A, () => syncOnce(server));
    expect(repA.pushed).toBe(59 + 2); // grammar seeds + word + its review card
    const repB = await on(B, () => syncOnce(server));
    expect(repB.conflicts).toBe(0);
    expect(await on(B, () => all<Grammar>('grammar'))).toHaveLength(59);
    expect((await on(B, () => db.vocab.get(v.id)))?.defEn).toBe('scene');
    expect(await on(B, pendingCount)).toBe(0);

    await on(B, () => saveVocab(v.id, { defZh: '场景' }));
    await on(B, () => syncOnce(server));
    await on(A, () => syncOnce(server));
    expect((await on(A, () => db.vocab.get(v.id)))?.defZh).toBe('场景');

    await on(A, () => remove('vocab', v.id));
    await on(A, () => syncOnce(server));
    await on(B, () => syncOnce(server));
    expect(await on(B, () => all<Vocab>('vocab'))).toHaveLength(0);
  });

  it('a record edited on both devices becomes a conflict; nothing is overwritten until the learner chooses', async () => {
    const { A, B, on, server } = devices();
    const v = await on(A, () => addVocab(noun('cadrage', 'm')));
    await on(A, () => syncOnce(server));
    await on(B, () => syncOnce(server));
    await on(A, () => saveVocab(v.id, { defEn: 'framing (A)' }));
    await on(B, () => saveVocab(v.id, { defEn: 'framing (B)' }));
    await on(A, () => syncOnce(server));
    const rep = await on(B, () => syncOnce(server));
    expect(rep.conflicts).toBe(1);
    expect((await on(B, () => db.vocab.get(v.id)))?.defEn).toBe('framing (B)'); // untouched
    expect((await server.get('vocab', v.id))?.data.defEn).toBe('framing (A)'); // untouched
    // B keeps its own version → it reaches A
    const [c] = await on(B, () => db.conflicts.toArray());
    expect(c.local.defEn).toBe('framing (B)');
    expect(c.remote.defEn).toBe('framing (A)');
    await on(B, () => resolveConflict(c.key, 'local'));
    await on(B, () => syncOnce(server));
    await on(A, () => syncOnce(server));
    expect((await on(A, () => db.vocab.get(v.id)))?.defEn).toBe('framing (B)');
    expect(await on(A, () => db.conflicts.count())).toBe(0);
  });

  it('choosing the remote copy replaces the local one', async () => {
    const { A, B, on, server } = devices();
    const v = await on(A, () => addVocab(noun('plan', 'm')));
    await on(A, () => syncOnce(server));
    await on(B, () => syncOnce(server));
    await on(A, () => saveVocab(v.id, { notes: 'A' }));
    await on(B, () => saveVocab(v.id, { notes: 'B' }));
    await on(A, () => syncOnce(server));
    await on(B, () => syncOnce(server));
    const [c] = await on(B, () => db.conflicts.toArray());
    await on(B, () => resolveConflict(c.key, 'remote'));
    expect((await on(B, () => db.vocab.get(v.id)))?.notes).toBe('A');
    expect((await on(B, () => syncOnce(server))).pushed).toBe(0);
  });

  it('review cards resolve automatically: the newer review wins', async () => {
    const { A, B, on, server } = devices();
    const v = await on(A, () => addVocab(noun('lumière', 'f')));
    await on(A, () => syncOnce(server));
    await on(B, () => syncOnce(server));
    const card = (await on(A, () => db.card.where('itemId').equals(v.id).first()))!;
    await on(A, () => grade(card.id, Rating.Good, DEFAULT_SETTINGS, new Date('2026-11-17T08:00:00Z')));
    await new Promise((r) => setTimeout(r, 5));
    await on(B, () => grade(card.id, Rating.Easy, DEFAULT_SETTINGS, new Date('2026-11-17T09:00:00Z')));
    await on(A, () => syncOnce(server));
    const rep = await on(B, () => syncOnce(server));
    expect(rep.conflicts).toBe(0);
    await on(A, () => syncOnce(server));
    const a = await on(A, () => db.card.get(card.id));
    const b = await on(B, () => db.card.get(card.id));
    expect(a?.due).toBe(b?.due); // both devices agree
    expect(await on(A, () => db.reviewLog.count())).toBe(2); // both review logs kept
  });

  it('timeline goals/sessions created offline on both devices merge', async () => {
    const { A, B, on, server } = devices();
    await on(A, () => insert('goal', { scope: 'week', period: '2026-11-16', title: 'A goal', skillFocus: [], done: false }));
    await on(B, () => insert('goal', { scope: 'week', period: '2026-11-16', title: 'B goal', skillFocus: [], done: false }));
    await on(A, () => syncOnce(server));
    await on(B, () => syncOnce(server));
    await on(A, () => syncOnce(server));
    expect((await on(A, () => all<{ title: string }>('goal'))).map((g) => g.title).sort()).toEqual(['A goal', 'B goal']);
    const g = (await on(B, () => all<{ id: string; title: string }>('goal')))[0];
    await on(B, () => update<import('../db/types').Goal>('goal', g.id, { done: true }));
    await on(B, () => syncOnce(server));
    await on(A, () => syncOnce(server));
    expect((await on(A, () => db.goal.get(g.id)))?.done).toBe(true);
  });

  it('migrates old random seed ids (and their cards) before the first sync', async () => {
    const { A, on } = devices();
    await on(A, async () => {
      await db.grammar.put({ id: 'random-1', createdAt: 'x', updatedAt: 'x', deletedAt: null, rev: 1, name: '定冠词与不定冠词 Articles définis et indéfinis', cefr: 'A1', category: '冠词', correctExamples: [], incorrectExamples: [], mastery: 2, skipped: false } as Grammar);
      await db.card.put({ id: 'c1', itemType: 'grammar', itemId: 'random-1' } as never);
      await normalizeSeedIds();
      expect(await db.grammar.get('random-1')).toBeUndefined();
      expect((await db.grammar.get(seedId(0)))?.mastery).toBe(2);
      expect((await db.card.get('c1'))?.itemId).toBe(seedId(0));
    });
  });
});
