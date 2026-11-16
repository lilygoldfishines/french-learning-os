import Papa from 'papaparse';
import { db, SCHEMA_VERSION, TABLES, setMeta, type TableName } from '../db/db';
import { displayLemma } from '../db/rules';
import type { SystemFields, Vocab } from '../db/types';

export const APP_ID = 'french-learning-os';
/** Device-local meta that must never leave the device (API key) or be restored (backup timestamp, running timer). */
export const NON_EXPORTED_META = ['lastBackupAt', 'aiConfig', 'timer'];

export interface Backup {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  checksum: string;
  data: Record<string, unknown[]>;
  meta: { key: string; value: unknown }[];
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Full export, including soft-deleted rows, so a restore is lossless. */
export async function exportAll(): Promise<Backup> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = await (db as unknown as Record<string, { toArray(): Promise<unknown[]> }>)[t].toArray();
    data[t] = rows;
    counts[t] = rows.length;
  }
  const meta = (await db.meta.toArray()).filter((m) => !NON_EXPORTED_META.includes(m.key));
  const checksum = await sha256(JSON.stringify(data));
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), counts, checksum, data, meta };
}

export async function markBackedUp() {
  await setMeta('lastBackupAt', new Date().toISOString());
}

export interface VerifyResult { ok: boolean; problems: string[]; backup?: Backup }

export async function verifyBackup(raw: unknown): Promise<VerifyResult> {
  const problems: string[] = [];
  const b = raw as Backup;
  if (!b || typeof b !== 'object') return { ok: false, problems: ['不是有效的 JSON 对象'] };
  if (b.app !== APP_ID) problems.push('这不是 French Learning OS 的备份文件');
  if (typeof b.schemaVersion !== 'number') problems.push('缺少 schemaVersion');
  else if (b.schemaVersion > SCHEMA_VERSION) problems.push(`备份来自更新的版本（v${b.schemaVersion}），请先更新应用`);
  if (!b.data || typeof b.data !== 'object') problems.push('缺少 data');
  if (problems.length) return { ok: false, problems };
  for (const t of Object.keys(b.counts ?? {})) {
    if ((b.data[t]?.length ?? 0) !== b.counts[t]) problems.push(`${t} 条数与记录不符`);
  }
  const sum = await sha256(JSON.stringify(b.data));
  if (sum !== b.checksum) problems.push('校验和不一致：文件可能被修改或损坏');
  return { ok: problems.length === 0, problems, backup: b };
}

export interface RestoreReport { added: number; updated: number; skipped: number }

/**
 * merge: rows absent locally are added; rows present are replaced only if the backup copy is newer (updatedAt).
 * replace: wipes local data first. Callers must export a safety copy before calling with replace.
 */
export async function restore(b: Backup, mode: 'merge' | 'replace'): Promise<RestoreReport> {
  const report: RestoreReport = { added: 0, updated: 0, skipped: 0 };
  const tables = TABLES.filter((t) => Array.isArray(b.data[t]));
  const dx = db as unknown as Record<TableName, import('dexie').Table<SystemFields, string>>;
  await db.transaction('rw', [...tables.map((t) => dx[t]), db.meta], async () => {
    if (mode === 'replace') {
      for (const t of TABLES) await dx[t].clear();
    }
    for (const t of tables) {
      for (const row of b.data[t] as SystemFields[]) {
        const cur = mode === 'replace' ? undefined : await dx[t].get(row.id);
        if (!cur) {
          await dx[t].put(row);
          report.added++;
        } else if (row.updatedAt > cur.updatedAt) {
          await dx[t].put(row);
          report.updated++;
        } else report.skipped++;
      }
    }
    for (const m of (b.meta ?? []).filter((x) => !NON_EXPORTED_META.includes(x.key))) {
      if (mode === 'replace' || !(await db.meta.get(m.key))) await db.meta.put(m);
    }
  });
  return report;
}

// ---------- CSV ----------
const ARR = ' | ';
const VOCAB_COLS = [
  'lemma', 'article', 'gender', 'plural', 'pos', 'ipa', 'audioUrl', 'defEn', 'defZh', 'examples', 'synonyms', 'antonyms',
  'related', 'collocations', 'prepositions', 'conjugation', 'topics', 'cefr', 'status', 'notes',
] as const;

export function vocabToCsv(rows: Vocab[]): string {
  return Papa.unparse(
    rows.map((v) => {
      const o: Record<string, string> = {};
      for (const c of VOCAB_COLS) {
        const val = v[c as keyof Vocab];
        if (c === 'examples') o[c] = v.examples.map((e) => [e.fr, e.en ?? '', e.zh ?? ''].join(' // ')).join(ARR);
        else if (Array.isArray(val)) o[c] = val.join(ARR);
        else o[c] = (val as string | undefined) ?? '';
      }
      return o;
    }),
    { columns: [...VOCAB_COLS] },
  );
}

/** Parses a vocab CSV into plain objects shaped like the AI vocab schema (validated later in the import preview). */
export function csvToVocabItems(text: string): Record<string, unknown>[] {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const split = (s?: string) => (s ? s.split('|').map((x) => x.trim()).filter(Boolean) : []);
  return res.data.map((r) => ({
    ...r,
    examples: split(r.examples).map((e) => {
      const [fr, en, zh] = e.split('//').map((x) => x.trim());
      return { fr, en, zh };
    }),
    synonyms: split(r.synonyms), antonyms: split(r.antonyms), related: split(r.related), collocations: split(r.collocations),
    prepositions: split(r.prepositions), topics: split(r.topics),
    cefr: r.cefr || undefined, article: r.article || undefined, gender: r.gender || undefined, status: r.status || undefined,
  }));
}

/** Quizlet import format: term TAB definition, one card per line. Nouns keep their article. */
export function vocabToQuizlet(rows: Vocab[], lang: 'en' | 'zh' | 'both' = 'both'): string {
  const clean = (s: string) => s.replace(/[\t\n]+/g, ' ').trim();
  return rows
    .map((v) => {
      const def = lang === 'en' ? v.defEn : lang === 'zh' ? v.defZh : [v.defEn, v.defZh].filter(Boolean).join(' / ');
      const g = v.pos === 'noun' && v.gender !== 'none' ? ` (n.${v.gender === 'm-f' ? 'm/f' : v.gender})` : '';
      return `${clean(displayLemma(v))}${g}\t${clean(def ?? '')}`;
    })
    .join('\n');
}

export function download(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
