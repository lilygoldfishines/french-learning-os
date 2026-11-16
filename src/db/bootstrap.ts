import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, insert, setMeta } from './db';
import { GRAMMAR_SEED } from '../data/seed';
import { DEFAULT_SETTINGS, type Grammar, type Settings } from './types';

export async function bootstrap() {
  if (!(await getMeta('seeded', false))) {
    await db.transaction('rw', db.grammar, db.meta, async () => {
      for (const g of GRAMMAR_SEED) {
        await insert<Omit<Grammar, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'>>('grammar', {
          ...g, explanationEn: '', explanationZh: '', structure: '', conditions: '', correctExamples: [], incorrectExamples: [],
          commonErrors: '', exceptions: '', mastery: 0, skipped: false, notes: '',
        });
      }
      await setMeta('seeded', true);
      await setMeta('settings', DEFAULT_SETTINGS);
    });
  }
}

export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** Returns a referentially stable object: it only changes when a setting value changes. */
export function useSettings(): Settings {
  const s = useLiveQuery(() => getMeta<Settings>('settings', DEFAULT_SETTINGS), []);
  const key = JSON.stringify(s ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(s ?? {}) }), [key]);
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getMeta<Settings>('settings', DEFAULT_SETTINGS);
  await setMeta('settings', { ...cur, ...patch });
}
