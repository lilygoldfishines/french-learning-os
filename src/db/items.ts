import { all, db, insert, update, nowIso } from './db';
import { ensureCard } from '../srs';
import {
  deriveErrorStatus, findExpressionDuplicate, findSimilarError, findTextDuplicate, findVocabDuplicate, validateVocab,
} from './rules';
import type { ErrorEntry, Expression, Grammar, Sentence, Vocab, SystemFields } from './types';

type New<T> = Omit<T, keyof SystemFields>;

export const emptyVocab = (): New<Vocab> => ({
  lemma: '', article: '', gender: 'none', plural: '', pos: 'noun', ipa: '', audioUrl: '', defEn: '', defZh: '',
  examples: [], synonyms: [], antonyms: [], related: [], collocations: [], prepositions: [], conjugation: '', topics: [],
  cefr: undefined, status: 'new', notes: '',
});

export class ValidationError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join('；'));
    this.problems = problems;
  }
}

export async function addVocab(v: New<Vocab>, opts: { allowPossibleDup?: boolean } = {}) {
  const problems = validateVocab(v);
  if (problems.length) throw new ValidationError(problems);
  const dup = findVocabDuplicate(v, await all<Vocab>('vocab'));
  if (dup?.kind === 'exact') throw new ValidationError([`已存在相同词条：${dup.existing.lemma}`]);
  if (dup?.kind === 'possible' && !opts.allowPossibleDup) throw new ValidationError([`可能重复：${dup.existing.lemma}（请确认后再保存）`]);
  const rec = await insert('vocab', v);
  await ensureCard('vocab', rec.id);
  return rec;
}

export async function saveVocab(id: string, v: Partial<Vocab>) {
  const cur = await db.vocab.get(id);
  const merged = { ...cur, ...v };
  const problems = validateVocab(merged);
  if (problems.length) throw new ValidationError(problems);
  await update<Vocab>('vocab', id, v);
}

export async function addExpression(e: New<Expression>) {
  if (!e.text.trim()) throw new ValidationError(['请填写表达']);
  const dup = findExpressionDuplicate(e, await all<Expression>('expression'));
  if (dup) throw new ValidationError([`已存在相同表达：${dup.existing.text}`]);
  const rec = await insert('expression', e);
  await ensureCard('expression', rec.id);
  return rec;
}

export async function addSentence(s: New<Sentence>) {
  if (!s.fr.trim()) throw new ValidationError(['请填写法语句子']);
  const dup = findTextDuplicate(s.fr, await all<Sentence>('sentence'), (x) => x.fr);
  if (dup) throw new ValidationError(['已存在相同句子']);
  const rec = await insert('sentence', s);
  await ensureCard('sentence', rec.id);
  return rec;
}

export async function addGrammar(g: New<Grammar>, withCard = false) {
  if (!g.name.trim()) throw new ValidationError(['请填写语法名称']);
  const dup = findTextDuplicate(g.name, await all<Grammar>('grammar'), (x) => x.name);
  if (dup) throw new ValidationError([`已存在：${dup.existing.name}`]);
  const rec = await insert('grammar', g);
  if (withCard) await ensureCard('grammar', rec.id);
  return rec;
}

export type NewError = Pick<ErrorEntry, 'original' | 'corrected' | 'errorType'> &
  Partial<Pick<ErrorEntry, 'explanation' | 'grammarRef' | 'notes'>> & { source?: string; date?: string };

/**
 * Logs an error. If a similar error exists (same type + same grammar point or same correction)
 * and merge=true, a new occurrence is added to it instead of creating a new row.
 */
export async function logError(e: NewError, opts: { merge?: boolean } = {}) {
  if (!e.original.trim() || !e.corrected.trim()) throw new ValidationError(['请填写原句和修正句']);
  const occ = { date: e.date ?? nowIso(), source: e.source };
  if (opts.merge) {
    const similar = findSimilarError(e, await all<ErrorEntry>('error'));
    if (similar) {
      const occurrences = [...similar.occurrences, occ];
      await update<ErrorEntry>('error', similar.id, { occurrences, status: deriveErrorStatus({ ...similar, occurrences }) });
      return { merged: true as const, id: similar.id };
    }
  }
  const rec = await insert('error', {
    original: e.original, corrected: e.corrected, errorType: e.errorType, explanation: e.explanation ?? '',
    grammarRef: e.grammarRef ?? '', notes: e.notes ?? '', occurrences: [occ], correctUses: [], status: 'open',
  } satisfies New<ErrorEntry>);
  await ensureCard('error', rec.id);
  return { merged: false as const, id: rec.id };
}

export async function recordCorrectUse(id: string, date = nowIso()) {
  const cur = await db.error.get(id);
  if (!cur) return;
  const correctUses = [...cur.correctUses, date];
  await update<ErrorEntry>('error', id, { correctUses, status: deriveErrorStatus({ ...cur, correctUses }) });
}

export async function recordRecurrence(id: string, source?: string) {
  const cur = await db.error.get(id);
  if (!cur) return;
  const occurrences = [...cur.occurrences, { date: nowIso(), source }];
  await update<ErrorEntry>('error', id, { occurrences, status: deriveErrorStatus({ ...cur, occurrences }) });
}
