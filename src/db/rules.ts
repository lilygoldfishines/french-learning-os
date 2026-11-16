import type { ErrorEntry, ErrorStatus, Expression, Vocab } from './types';
import { tr } from '../i18n';

const ARTICLE_RE = /^(le|la|les|un|une|des|du|de la|de l'|l'|l’)\s*/i;

/** Normalised form for duplicate detection: lowercase, no leading article, single spaces. Accents are kept. */
export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(ARTICLE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function guessArticle(lemma: string): { article?: string; lemma: string } {
  const m = lemma.trim().match(/^(le|la|les|l'|l’)\s*(.+)$/i);
  if (!m) return { lemma: lemma.trim() };
  return { article: m[1].toLowerCase().replace('’', "'"), lemma: m[2].trim() };
}

export function articleToGender(article?: string): 'm' | 'f' | undefined {
  if (!article) return undefined;
  const a = article.toLowerCase();
  if (a === 'le' || a === 'un') return 'm';
  if (a === 'la' || a === 'une') return 'f';
  return undefined;
}

/** Returns a list of human-readable problems; empty = valid. */
export function validateVocab(v: Partial<Vocab>): string[] {
  const errs: string[] = [];
  if (!v.lemma || !v.lemma.trim()) errs.push(tr('请填写法语词条'));
  if (!v.pos) errs.push(tr('请选择词性'));
  if (v.pos === 'noun' && (!v.gender || v.gender === 'none')) errs.push(tr('名词必须标注阴阳性'));
  return errs;
}

export function displayLemma(v: Pick<Vocab, 'lemma' | 'article'>): string {
  if (!v.article) return v.lemma;
  return v.article.endsWith("'") ? `${v.article}${v.lemma}` : `${v.article} ${v.lemma}`;
}

export type DupKind = 'exact' | 'possible';
export interface DupHit<T> { kind: DupKind; existing: T }

/** exact = same normalised lemma + same POS + same gender; possible = same normalised lemma otherwise. */
export function findVocabDuplicate<T extends Pick<Vocab, 'lemma' | 'pos' | 'gender' | 'id'>>(
  cand: Pick<Vocab, 'lemma' | 'pos' | 'gender'>,
  existing: T[],
  ignoreId?: string,
): DupHit<T> | null {
  const key = normalize(cand.lemma);
  let possible: T | null = null;
  for (const e of existing) {
    if (e.id === ignoreId) continue;
    if (normalize(e.lemma) !== key) continue;
    if (e.pos === cand.pos && e.gender === cand.gender) return { kind: 'exact', existing: e };
    possible = possible ?? e;
  }
  return possible ? { kind: 'possible', existing: possible } : null;
}

export function findTextDuplicate<T extends { id: string }>(
  text: string,
  existing: T[],
  getText: (t: T) => string,
  ignoreId?: string,
): DupHit<T> | null {
  const key = normalize(text);
  const hit = existing.find((e) => e.id !== ignoreId && normalize(getText(e)) === key);
  return hit ? { kind: 'exact', existing: hit } : null;
}

export const findExpressionDuplicate = (e: Pick<Expression, 'text'>, list: Expression[], ignoreId?: string) =>
  findTextDuplicate(e.text, list, (x) => x.text, ignoreId);

/** An existing error is "the same error" if it has the same type and either the same grammar point or the same correction. */
export function findSimilarError(
  cand: Pick<ErrorEntry, 'errorType' | 'grammarRef' | 'corrected'>,
  list: ErrorEntry[],
): ErrorEntry | null {
  return (
    list.find(
      (e) =>
        e.errorType === cand.errorType &&
        ((cand.grammarRef && e.grammarRef && normalize(cand.grammarRef) === normalize(e.grammarRef)) ||
          normalize(e.corrected) === normalize(cand.corrected)),
    ) ?? null
  );
}

export const VERIFY_MIN_USES = 2;
export const VERIFY_MIN_SPAN_DAYS = 7;

/**
 * Status is derived, never set directly. Only correct uses AFTER the most recent occurrence count.
 * verified = at least 2 such uses, with first and last at least 7 days apart.
 */
export function deriveErrorStatus(e: Pick<ErrorEntry, 'occurrences' | 'correctUses'>): ErrorStatus {
  const lastOcc = e.occurrences.reduce((m, o) => (o.date > m ? o.date : m), '');
  const uses = e.correctUses.filter((d) => d > lastOcc).sort();
  if (uses.length === 0) return 'open';
  if (uses.length >= VERIFY_MIN_USES) {
    const span = (Date.parse(uses[uses.length - 1]) - Date.parse(uses[0])) / 86400000;
    if (span >= VERIFY_MIN_SPAN_DAYS) return 'verified';
  }
  return 'practicing';
}

/** Monday of the week containing d, as yyyy-mm-dd (local time). */
export function weekStart(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return localDate(x);
}
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + n));
}
