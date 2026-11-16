import { z } from 'zod';
import { all } from '../db/db';
import { addExpression, addGrammar, addSentence, addVocab, emptyVocab, logError, recordRecurrence } from '../db/items';
import {
  articleToGender, findExpressionDuplicate, findSimilarError, findTextDuplicate, findVocabDuplicate, guessArticle, validateVocab,
} from '../db/rules';
import { CEFR_LEVELS, ERROR_TYPES, GENDERS, POS, type ErrorEntry, type Expression, type Grammar, type Sentence, type Vocab } from '../db/types';

const str = z.string().trim();
const optStr = z.string().trim().optional().nullable().transform((v) => v ?? '');
const strArr = z.array(z.string().trim()).optional().default([]);
const example = z.object({ fr: str.min(1), en: optStr, zh: optStr });

export const VocabIn = z.object({
  lemma: str.min(1, '缺少 lemma'),
  article: optStr,
  gender: z.enum(GENDERS).optional(),
  plural: optStr,
  pos: z.enum(POS, { message: `pos 必须是 ${POS.join(' / ')} 之一` }),
  ipa: optStr,
  audioUrl: optStr,
  defEn: optStr,
  defZh: optStr,
  examples: z.array(example).optional().default([]),
  synonyms: strArr, antonyms: strArr, related: strArr, collocations: strArr, prepositions: strArr,
  conjugation: optStr,
  topics: strArr,
  cefr: z.enum(CEFR_LEVELS).optional(),
  status: z.enum(['new', 'learning', 'familiar', 'mastered']).optional(),
  notes: optStr,
});

export const ExpressionIn = z.object({
  text: str.min(1), defEn: optStr, defZh: optStr, context: optStr, register: optStr, category: optStr,
  examples: z.array(example).optional().default([]), dialogue: optStr, naturalness: optStr, notes: optStr,
});
export const SentenceIn = z.object({ fr: str.min(1), en: optStr, zh: optStr, source: optStr, notes: optStr });
export const GrammarIn = z.object({
  name: str.min(1), cefr: z.enum(CEFR_LEVELS), category: optStr, explanationEn: optStr, explanationZh: optStr,
  structure: optStr, conditions: optStr, correctExamples: strArr, incorrectExamples: strArr, commonErrors: optStr,
  exceptions: optStr, notes: optStr,
});
export const ErrorIn = z.object({
  original: str.min(1), corrected: str.min(1), errorType: z.enum(ERROR_TYPES, { message: `errorType 必须是 ${ERROR_TYPES.join(' / ')} 之一` }),
  explanation: optStr, grammarRef: optStr, source: optStr,
});

export type Kind = 'vocab' | 'expression' | 'sentence' | 'grammar' | 'error';
export const KIND_LABEL: Record<Kind, string> = { vocab: '词汇', expression: '表达', sentence: '句子', grammar: '语法', error: '错误' };
const SCHEMAS = { vocab: VocabIn, expression: ExpressionIn, sentence: SentenceIn, grammar: GrammarIn, error: ErrorIn };

export type RowStatus = 'new' | 'possible-dup' | 'duplicate' | 'similar-error' | 'invalid';
export type Action = 'add' | 'skip' | 'merge' | 'add-anyway';
export interface PreviewRow {
  key: number;
  kind: Kind;
  raw: unknown;
  data?: Record<string, unknown>;
  status: RowStatus;
  issues: string[];
  existingId?: string;
  existingLabel?: string;
  action: Action;
}

const ENVELOPE_KEYS: Record<string, Kind> = {
  vocab: 'vocab', vocabulary: 'vocab', expressions: 'expression', expression: 'expression', sentences: 'sentence',
  sentence: 'sentence', grammar: 'grammar', errors: 'error', error: 'error',
};

/** Accepts {schema:"flos.<kind>.v1", items:[...]}, {vocab:[...], errors:[...], ...}, or a bare array with a kind hint. */
export function extractItems(text: string, hint?: Kind): { items: { kind: Kind; raw: unknown }[]; problems: string[] } {
  let parsed: unknown;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { items: [], problems: [`JSON 格式错误：${(e as Error).message}`] };
  }
  const items: { kind: Kind; raw: unknown }[] = [];
  const problems: string[] = [];
  if (Array.isArray(parsed)) {
    if (!hint) return { items, problems: ['这是一个数组，请先选择内容类型'] };
    for (const r of parsed) items.push({ kind: hint, raw: r });
    return { items, problems };
  }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    if (typeof o.schema === 'string') {
      const m = o.schema.match(/^flos\.(vocab|expression|sentence|grammar|error)\.v1$/);
      if (!m) return { items, problems: [`不认识的 schema：${o.schema}`] };
      if (!Array.isArray(o.items)) return { items, problems: ['缺少 items 数组'] };
      for (const r of o.items) items.push({ kind: m[1] as Kind, raw: r });
      return { items, problems };
    }
    for (const [k, v] of Object.entries(o)) {
      const kind = ENVELOPE_KEYS[k];
      if (!kind) { problems.push(`忽略未知字段：${k}`); continue; }
      if (!Array.isArray(v)) { problems.push(`${k} 应该是数组`); continue; }
      for (const r of v) items.push({ kind, raw: r });
    }
    if (!items.length && !problems.length) problems.push('没有找到可导入的内容');
    return { items, problems };
  }
  return { items, problems: ['无法识别的内容'] };
}

function normaliseVocab(d: z.infer<typeof VocabIn>): Omit<Vocab, keyof import('../db/types').SystemFields> {
  let { lemma, article } = d;
  if (!article) {
    const g = guessArticle(lemma);
    lemma = g.lemma;
    article = g.article ?? '';
  }
  const gender = d.gender ?? articleToGender(article) ?? 'none';
  return { ...emptyVocab(), ...d, lemma, article, gender, status: d.status ?? 'new', examples: d.examples.map((e) => ({ fr: e.fr, en: e.en, zh: e.zh })) };
}

export async function buildPreview(items: { kind: Kind; raw: unknown }[]): Promise<PreviewRow[]> {
  const [vocab, expr, sent, gram, errs] = await Promise.all([
    all<Vocab>('vocab'), all<Expression>('expression'), all<Sentence>('sentence'), all<Grammar>('grammar'), all<ErrorEntry>('error'),
  ]);
  const seen = { vocab: [] as Vocab[], expression: [] as Expression[], sentence: [] as Sentence[], grammar: [] as Grammar[] };
  return items.map(({ kind, raw }, key): PreviewRow => {
    const res = SCHEMAS[kind].safeParse(raw);
    if (!res.success) {
      return { key, kind, raw, status: 'invalid', action: 'skip', issues: res.error.issues.map((i) => `${i.path.join('.') || '条目'}：${i.message}`) };
    }
    const row: PreviewRow = { key, kind, raw, data: res.data as Record<string, unknown>, status: 'new', issues: [], action: 'add' };
    if (kind === 'vocab') {
      const v = normaliseVocab(res.data as z.infer<typeof VocabIn>);
      row.data = v as unknown as Record<string, unknown>;
      const problems = validateVocab(v);
      if (problems.length) return { ...row, status: 'invalid', action: 'skip', issues: problems };
      const dup = findVocabDuplicate(v, [...vocab, ...seen.vocab]);
      if (dup) {
        row.status = dup.kind === 'exact' ? 'duplicate' : 'possible-dup';
        row.action = 'skip';
        row.existingId = dup.existing.id;
        row.existingLabel = `${dup.existing.article ?? ''} ${dup.existing.lemma}`.trim();
      }
      seen.vocab.push({ ...(v as Vocab), id: `pending-${key}` });
    } else if (kind === 'expression' || kind === 'sentence' || kind === 'grammar') {
      const text = String((res.data as Record<string, unknown>)[kind === 'expression' ? 'text' : kind === 'sentence' ? 'fr' : 'name']);
      const list = kind === 'expression' ? [...expr, ...seen.expression] : kind === 'sentence' ? [...sent, ...seen.sentence] : [...gram, ...seen.grammar];
      const getText = (x: Expression | Sentence | Grammar) => ('text' in x ? x.text : 'fr' in x ? x.fr : x.name);
      const dup = kind === 'expression'
        ? findExpressionDuplicate({ text }, list as Expression[])
        : findTextDuplicate(text, list as (Expression | Sentence | Grammar)[], getText);
      if (dup) {
        row.status = 'duplicate';
        row.action = 'skip';
        row.existingId = dup.existing.id;
        row.existingLabel = getText(dup.existing as Expression | Sentence | Grammar);
      }
      (seen[kind] as unknown[]).push({ ...(res.data as object), id: `pending-${key}` });
    } else if (kind === 'error') {
      const sim = findSimilarError(res.data as z.infer<typeof ErrorIn>, errs);
      if (sim) {
        row.status = 'similar-error';
        row.action = 'merge';
        row.existingId = sim.id;
        row.existingLabel = `${sim.original} → ${sim.corrected}`;
      }
    }
    return row;
  });
}

export interface CommitReport { added: number; merged: number; skipped: number; failed: { key: number; message: string }[] }

/** Writes only rows whose action is add / add-anyway / merge. Nothing is overwritten. */
export async function commit(rows: PreviewRow[]): Promise<CommitReport> {
  const rep: CommitReport = { added: 0, merged: 0, skipped: 0, failed: [] };
  for (const r of rows) {
    if (r.action === 'skip' || r.status === 'invalid' || !r.data) { rep.skipped++; continue; }
    try {
      const d = r.data as never;
      if (r.kind === 'vocab') {
        if (r.status === 'duplicate') { rep.skipped++; continue; }
        await addVocab(d, { allowPossibleDup: r.action === 'add-anyway' });
        rep.added++;
      } else if (r.kind === 'expression') { await addExpression({ ...(d as object), naturalness: (d as Expression).naturalness } as never); rep.added++; }
      else if (r.kind === 'sentence') { await addSentence(d); rep.added++; }
      else if (r.kind === 'grammar') { await addGrammar({ ...(d as object), mastery: 0, skipped: false } as never); rep.added++; }
      else if (r.kind === 'error') {
        const e = r.data as z.infer<typeof ErrorIn>;
        if (r.action === 'merge' && r.existingId) { await recordRecurrence(r.existingId, e.source || 'AI 导入'); rep.merged++; }
        else { await logError({ ...e, source: e.source || 'AI 导入' }); rep.added++; }
      }
    } catch (err) {
      rep.failed.push({ key: r.key, message: (err as Error).message });
    }
  }
  return rep;
}
