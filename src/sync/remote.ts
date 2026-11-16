import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushItem, Remote, RemoteRow } from './engine';
import type { TableName } from '../db/db';

/** Public project settings: the publishable key is meant to ship in the page; row-level security protects the data. */
export const SUPABASE_URL = 'https://rloipmnxjahndadimroe.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_LJOhb5HVcu2NDu7JdUjEOg_wqnObKSi';

let client: Promise<SupabaseClient> | null = null;
export function getClient() {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    // implicit flow: email links may open in Safari while the app lives on the home screen (separate storage),
    // so the PKCE verifier would not be found; implicit links carry the session themselves.
    createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'flos-auth', flowType: 'implicit', detectSessionInUrl: true } }),
  );
  return client;
}

const COLS = 'tbl,id,data,deleted,version,server_updated_at';

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async pull(since, limit) {
      const { data, error } = await sb.from('records').select(COLS).gt('server_updated_at', since).order('server_updated_at').limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
    async push(items: PushItem[]) {
      const { data, error } = await sb.rpc('sync_push', { items });
      if (error) throw new Error(error.message);
      return data as { tbl: string; id: string; version: number | null }[];
    },
    async get(tbl: TableName, id: string) {
      const { data, error } = await sb.from('records').select(COLS).eq('tbl', tbl).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as RemoteRow | null) ?? null;
    },
  };
}
