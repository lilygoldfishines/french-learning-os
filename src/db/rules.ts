import type { Cefr, ErrorEntry, ErrorStatus, Expression, Vocab } from './types';
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
  const t = lemma.trim().replace(/[’‘ʼ`´]/g, "'");
  const m = t.match(/^(l')\s*(.+)$/i) ?? t.match(/^(le|la|les)\s+(.+)$/i);
  if (!m) return { lemma: t };
  return { article: m[1].toLowerCase(), lemma: m[2].trim() };
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

/** Typographic apostrophes (’ ‘ ʼ) from AI output or iOS keyboards → plain ' so elision is recognised. */
export const normArticle = (a: string) => a.trim().replace(/[’‘ʼ`´]/g, "'");

export function displayLemma(v: Pick<Vocab, 'lemma' | 'article'>): string {
  if (!v.article) return v.lemma;
  const a = normArticle(v.article);
  return a.endsWith("'") ? `${a}${v.lemma}` : `${a} ${v.lemma}`;
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

/** Gender markers people commonly write after a noun: (f.) (m) [f] n.f. nm (阴) (阳性) — and m/f alone. */
const GENDER_MARK = /\s*(?:\(\s*(?:n\.?\s*)?([mf])\.?\s*\)|\[\s*(?:n\.?\s*)?([mf])\.?\s*\]|\(\s*(阴|阳)性?\s*\)|（\s*(?:n\.?\s*)?([mf阴阳])\.?性?\s*）|\bn\.?\s*([mf])\.?(?=\s|$)|\s([mf])\.?(?=\s*$))\s*$/i;

export interface BatchLine { lemma: string; article?: string; gender?: 'm' | 'f'; pos: Vocab['pos']; defEn?: string; defZh?: string }

/** One line of the batch box: "l'assiette (f.) | plate | 盘子". */
export function parseBatchLine(line: string, defaultPos: Vocab['pos']): BatchLine {
  const [frRaw = '', en, zh] = splitFields(line, true);
  let fr = frRaw.trim();
  let gender: 'm' | 'f' | undefined;
  const m = fr.match(GENDER_MARK);
  if (m) {
    const g = (m.slice(1).find(Boolean) ?? '').toLowerCase();
    gender = g === 'f' || g === '阴' ? 'f' : 'm';
    fr = fr.slice(0, m.index).trim();
  }
  const { article, lemma } = guessArticle(fr);
  gender = gender ?? articleToGender(article);
  const pos = article || gender ? 'noun' : defaultPos;
  return { lemma, article, gender, pos, defEn: en?.trim() || undefined, defZh: zh?.trim() || undefined };
}

const HAS_CJK = /[\u3400-\u9fff]/;

/** Fields of one batch line. "|" wins (so 场景；舞台 stays whole); then tabs; vocab also accepts ; as before. */
export function splitFields(line: string, allowSemicolon = false): string[] {
  const sep = /[|｜]/.test(line) ? /\s*[|｜]\s*/ : line.includes('\t') ? /\s*\t\s*/ : allowSemicolon ? /\s*[;；]\s*/ : null;
  return (sep ? line.split(sep) : [line]).map((f) => f.trim());
}

/** "faire la grasse matinée | to sleep in | 睡懒觉" — the two meanings may come in either order. */
export function parseExpressionLine(line: string): { text: string; defEn?: string; defZh?: string } {
  const [text = '', ...defs] = splitFields(line);
  const zh = defs.find((d) => HAS_CJK.test(d));
  const en = defs.find((d) => d && d !== zh);
  return { text, defEn: en || undefined, defZh: zh || undefined };
}

/** "subjonctif après bien que | bien que + subj. | 让步从句用虚拟式 | Bien qu'il pleuve, on tourne. | B2" — level may sit in any field or as [B2]. */
export function parseGrammarLine(line: string, defaultCefr: Cefr): {
  name: string; cefr: Cefr; structure?: string; explanationEn?: string; explanationZh?: string; correctExamples: string[];
} {
  let cefr = defaultCefr;
  const fields = splitFields(line).filter((f) => {
    const m = f.match(/^\[?\s*([ABC][12])\s*\]?$/i);
    if (m) cefr = m[1].toUpperCase() as Cefr;
    return !m;
  });
  let [name = '', structure, explanation, example] = fields;
  const tag = name.match(/^\[\s*([ABC][12])\s*\]\s*/i);
  if (tag) { cefr = tag[1].toUpperCase() as Cefr; name = name.slice(tag[0].length); }
  const zh = explanation && HAS_CJK.test(explanation);
  return {
    name: name.trim(), cefr, structure: structure || undefined,
    explanationZh: zh ? explanation : undefined, explanationEn: explanation && !zh ? explanation : undefined,
    correctExamples: example ? [example] : [],
  };
}
