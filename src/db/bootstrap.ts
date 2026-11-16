import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, insert, setMeta } from './db';
import { GRAMMAR_SEED } from '../data/seed';
import { DEFAULT_SETTINGS, type Grammar, type Settings } from './types';

export async function bootstrap() {
  if (!(await getMeta('seeded', false))) {
    await db.transaction('rw', db.grammar, db.meta, async () => {
      for (const [i, g] of GRAMMAR_SEED.entries()) {
        await insert<Omit<Grammar, 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'>>('grammar', {
          id: seedId(i), ...g, explanationEn: '', explanationZh: '', structure: '', conditions: '', correctExamples: [], incorrectExamples: [],
          commonErrors: '', exceptions: '', mastery: 0, skipped: false, notes: '',
        });
      }
      await setMeta('seeded', true);
      await setMeta('settings', DEFAULT_SETTINGS);
    });
  }
  await normalizeSeedIds();
}

/** Seed rows get the same id on every device, so syncing two devices does not duplicate them. */
export const seedId = (i: number) => `seed-grammar-${i}`;

/** Earlier versions seeded with random ids: re-key them (and their review cards) before they are ever synced. */
export async function normalizeSeedIds() {
  const byName = new Map(GRAMMAR_SEED.map((g, i) => [g.name, i]));
  await db.transaction('rw', db.grammar, db.card, db.syncState, async () => {
    for (const g of await db.grammar.toArray()) {
      const i = byName.get(g.name);
      if (i === undefined || g.id === seedId(i)) continue;
      if (await db.syncState.get(`grammar|${g.id}`)) continue; // already synced under its old id: leave it
      if (await db.grammar.get(seedId(i))) continue;
      await db.grammar.delete(g.id);
      await db.grammar.put({ ...g, id: seedId(i) });
      for (const c of await db.card.where('itemId').equals(g.id).toArray()) await db.card.put({ ...c, itemId: seedId(i) });
    }
  });
}

export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** Returns a referentially stable object: it only changes when a setting value changes. */
export function useSettings(): Settings {
  const s = useLiveQuery(() => getMeta<Settings>('settings', DEFAULT_SETTINGS), []);
  const merged = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  const key = JSON.stringify(merged);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => merged, [key]);
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getMeta<Settings>('settings', DEFAULT_SETTINGS);
  await setMeta('settings', { ...cur, ...patch });
}
