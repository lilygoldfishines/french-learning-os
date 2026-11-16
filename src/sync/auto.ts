import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db, getMeta, setMeta, TABLES } from '../db/db';
import { isApplyingRemote, pendingCount, resetSyncState, syncOnce, type SyncReport } from './engine';
import { getClient, supabaseRemote } from './remote';

export interface SyncStatus {
  signedIn: boolean;
  email?: string;
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncAt?: string;
  error?: string;
  pending: number;
  conflicts: number;
  last?: SyncReport;
}

let status: SyncStatus = { signedIn: false, state: 'off', pending: 0, conflicts: 0 };
const listeners = new Set<(s: SyncStatus) => void>();
function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}
export function useSyncStatus() {
  const [s, setS] = useState(status);
  useEffect(() => { listeners.add(setS); setS(status); return () => { listeners.delete(setS); }; }, []);
  return s;
}

async function refreshCounts() {
  set({ pending: await pendingCount(), conflicts: await db.conflicts.count(), lastSyncAt: (await getMeta<string | null>('lastSyncAt', null)) ?? undefined });
}

let running = false, again = false, timer: ReturnType<typeof setTimeout> | undefined;
let session: Session | null = null;

export async function syncNow(): Promise<void> {
  if (!session) return;
  if (!navigator.onLine) { set({ state: 'offline' }); return; }
  if (running) { again = true; return; }
  running = true;
  set({ state: 'syncing', error: undefined });
  try {
    const sb = await getClient();
    const last = await syncOnce(supabaseRemote(sb));
    set({ state: 'idle', last });
  } catch (e) {
    set({ state: 'error', error: (e as Error).message });
  } finally {
    running = false;
    await refreshCounts();
    if (again) { again = false; void syncNow(); }
  }
}

/** Debounced sync after local edits. */
export function scheduleSync(ms = 4000) {
  if (!session) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

async function onSession(s: Session | null) {
  session = s;
  if (!s) { set({ signedIn: false, email: undefined, state: 'off' }); return; }
  // a different account than the one this device last synced with: start bookkeeping fresh (local data stays)
  const prev = await getMeta<string | null>('syncUserId', null);
  if (prev && prev !== s.user.id) await resetSyncState();
  await setMeta('syncUserId', s.user.id);
  set({ signedIn: true, email: s.user.email ?? undefined, state: 'idle' });
  void syncNow();
}

let started = false;
export async function startSync() {
  if (started) return;
  started = true;
  for (const t of TABLES) {
    const table = (db as unknown as Record<string, import('dexie').Table>)[t];
    const touch = () => { if (!isApplyingRemote()) scheduleSync(); };
    table.hook('creating', touch);
    table.hook('updating', touch);
    table.hook('deleting', touch);
  }
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  setInterval(() => void syncNow(), 3 * 60 * 1000);
  await refreshCounts();
  // only load the Supabase library if this device has ever signed in
  if (!localStorage.getItem('flos-auth')) return;
  await attachAuth();
}

let attached = false;
async function attachAuth() {
  if (attached) return;
  attached = true;
  const sb = await getClient();
  sb.auth.onAuthStateChange((_e, s) => { void onSession(s); });
  const { data } = await sb.auth.getSession();
  await onSession(data.session);
}

export async function signIn(email: string, password: string) {
  const sb = await getClient();
  await attachAuth();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}
export async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'> {
  const sb = await getClient();
  await attachAuth();
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
  if (error) throw new Error(error.message);
  return data.session ? 'signed-in' : 'confirm-email';
}
export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
  await resetSyncState();
  await refreshCounts();
}
