import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, insert, setMeta } from '../db/db';
import type { ActivityType, Session, Skill } from '../db/types';

interface TimerState { startedAt: string; activityType: ActivityType; skill: Skill | 'mixed' }

export async function startTimer(activityType: ActivityType, skill: Skill | 'mixed') {
  await setMeta('timer', { startedAt: new Date().toISOString(), activityType, skill } satisfies TimerState);
}

export async function stopTimer(notes = '', outcome = ''): Promise<number> {
  const t = await getMeta<TimerState | null>('timer', null);
  if (!t) return 0;
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(t.startedAt)) / 60000));
  await insert<Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev'>>('session', {
    startedAt: t.startedAt, minutes, activityType: t.activityType, skill: t.skill, notes, outcome,
  });
  await db.meta.delete('timer');
  return minutes;
}

export function useTimer() {
  const t = useLiveQuery(() => getMeta<TimerState | null>('timer', null), []);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!t) return;
    const i = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(i);
  }, [t]);
  return {
    running: !!t,
    state: t ?? null,
    elapsedMin: t ? Math.floor((Date.now() - Date.parse(t.startedAt)) / 60000) : 0,
    stop: stopTimer,
  };
}
