import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, setMeta } from '../db/db';
import { VocabIn } from '../io/aiImport';
import { articleToGender, guessArticle } from '../db/rules';
import { POS, GENDERS, CEFR_LEVELS, VOCAB_TOPICS, type Vocab } from '../db/types';
import { tr, trf } from '../i18n';

/**
 * Optional AI auto-fill. Calls the Anthropic Messages API straight from the browser with the
 * learner's own key (stored only in this device's IndexedDB; never exported or synced).
 */
export interface AiConfig { apiKey: string; model: string }
export const DEFAULT_MODEL = 'claude-haiku-5-5';
const KEY = 'aiConfig';

export async function getAiConfig(): Promise<AiConfig | null> {
  const c = await getMeta<AiConfig | null>(KEY, null);
  return c?.apiKey ? { ...c, model: c.model || DEFAULT_MODEL } : null;
}
export async function saveAiConfig(c: AiConfig | null) {
  if (!c || !c.apiKey.trim()) await db.meta.delete(KEY);
  else await setMeta(KEY, { apiKey: c.apiKey.trim(), model: c.model || DEFAULT_MODEL });
}
export const AI_META_KEYS = [KEY];

const TOOL = {
  name: 'fill_vocab_entry',
  description: 'Return a complete French dictionary entry for the learner\'s vocabulary database.',
  input_schema: {
    type: 'object',
    required: ['lemma', 'pos', 'gender', 'defEn', 'defZh', 'examples'],
    properties: {
      lemma: { type: 'string', description: 'Dictionary form without article (infinitive for verbs, masculine singular for adjectives).' },
      article: { type: 'string', description: "Definite article for nouns: le, la, l' or les. Empty for non-nouns." },
      gender: { type: 'string', enum: [...GENDERS], description: "m, f, m-f (both genders, e.g. un/une élève), or none for non-nouns." },
      plural: { type: 'string', description: 'Plural form for nouns (and adjectives if irregular). Empty otherwise.' },
      pos: { type: 'string', enum: [...POS] },
      ipa: { type: 'string', description: 'IPA without slashes, standard French (Paris).' },
      defEn: { type: 'string', description: 'Concise English definition; separate senses with "; ". Most common senses first.' },
      defZh: { type: 'string', description: tr('简体中文解释，简洁；多个义项用“；”分隔。') },
      examples: {
        type: 'array', minItems: 1, maxItems: 2,
        items: { type: 'object', required: ['fr', 'en', 'zh'], properties: { fr: { type: 'string' }, en: { type: 'string' }, zh: { type: 'string' } } },
        description: 'Natural, contemporary example sentences, B1–B2 level, preferably everyday or film/arts contexts.',
      },
      synonyms: { type: 'array', items: { type: 'string' } },
      antonyms: { type: 'array', items: { type: 'string' } },
      collocations: { type: 'array', items: { type: 'string' }, description: 'Common collocations, e.g. "tourner une scène".' },
      prepositions: { type: 'array', items: { type: 'string' }, description: 'Prepositions the word typically takes, e.g. "à", "de".' },
      conjugation: { type: 'string', description: 'For verbs: group, auxiliary, past participle, irregular stems. Empty otherwise.' },
      topics: { type: 'array', items: { type: 'string', enum: [...VOCAB_TOPICS] } },
      cefr: { type: 'string', enum: [...CEFR_LEVELS], description: 'Approximate CEFR level at which this word is typically learned.' },
      notes: { type: 'string', description: 'One short usage note in English only if genuinely useful (false friend, register, common mistake). Otherwise empty.' },
    },
  },
} as const;

/** fatal = stop a bulk run (bad key, no balance, offline). */
export class AiError extends Error {
  fatal: boolean;
  constructor(msg: string, fatal = false) { super(msg); this.fatal = fatal; }
}

export type FilledVocab = Omit<Vocab, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rev' | 'status' | 'related'>;

/** Ask Claude for a full entry. `input` may include an article ("la scène") or a phrase. */
export async function aiFillVocab(input: string, cfg: AiConfig, opts: { posHint?: string; fetchFn?: typeof fetch } = {}): Promise<FilledVocab> {
  const word = input.trim();
  if (!word) throw new AiError(tr('请先输入一个法语词'));
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError(tr('当前离线，AI 补全需要联网'), true);
  const fetchFn = opts.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model || DEFAULT_MODEL,
        max_tokens: 1200,
        system:
          'You are a precise French lexicographer helping a Chinese-native learner (English fluent, French B1, working in film). ' +
          'Fill the dictionary entry accurately. Nouns MUST have the correct grammatical gender and article. ' +
          'If the input has a typo or missing accents, correct it in lemma. If the input is ambiguous, choose the most common reading' +
          (opts.posHint ? ` (the learner indicated part of speech: ${opts.posHint})` : '') + '.',
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: `French word or expression: ${word}` }],
      }),
    });
  } catch {
    throw new AiError(tr('无法连接 AI 服务，请检查网络'), true);
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message ?? ''; } catch { /* ignore */ }
    if (res.status === 401) throw new AiError(tr('API 密钥无效，请在设置里检查'), true);
    if (res.status === 429) throw new AiError(tr('请求太频繁或额度不足，稍后再试'), true);
    if (res.status === 400 && /credit|balance/i.test(msg)) throw new AiError(tr('API 账户余额不足'), true);
    throw new AiError(trf('AI 服务出错（{0}）{1}', res.status, msg ? trf('：{0}', msg) : ''));
  }
  const data = await res.json();
  const block = (data?.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  if (!block?.input) throw new AiError(tr('AI 没有返回词条'));
  const parsed = VocabIn.safeParse(block.input);
  if (!parsed.success) throw new AiError(trf('AI 返回格式不对：{0}', parsed.error.issues[0]?.message ?? ''));
  const v = parsed.data;
  let { lemma, article } = v;
  if (!article) { const g = guessArticle(lemma); lemma = g.lemma; article = g.article ?? ''; }
  const gender = v.pos === 'noun' ? (v.gender && v.gender !== 'none' ? v.gender : articleToGender(article) ?? 'none') : 'none';
  return {
    lemma, article: v.pos === 'noun' ? article : '', gender, plural: v.plural, pos: v.pos, ipa: v.ipa?.replace(/^\/|\/$/g, ''), audioUrl: '',
    defEn: v.defEn, defZh: v.defZh, examples: v.examples.map((e) => ({ fr: e.fr, en: e.en, zh: e.zh })),
    synonyms: v.synonyms, antonyms: v.antonyms, collocations: v.collocations, prepositions: v.prepositions,
    conjugation: v.conjugation, topics: v.topics.filter((t) => (VOCAB_TOPICS as readonly string[]).includes(t)), cefr: v.cefr, notes: v.notes,
  };
}

/** Merge AI output into an existing draft without overwriting anything the learner already typed. */
export function mergeFill<T extends Partial<Vocab>>(draft: T, fill: FilledVocab): T {
  const out: Record<string, unknown> = { ...draft };
  for (const [k, val] of Object.entries(fill)) {
    const cur = out[k];
    const empty = cur === undefined || cur === null || cur === '' || (Array.isArray(cur) && cur.length === 0) || (k === 'gender' && cur === 'none');
    if (empty) out[k] = val;
  }
  // the lemma/pos come from the learner; but if they typed "la scène" let the parsed article/lemma win
  if (!draft.lemma || /^(le|la|les|l'|l’)\s*/i.test(String(draft.lemma))) { out.lemma = fill.lemma; out.article = fill.article; }
  return out as T;
}

export function useAiConfig() {
  return useLiveQuery(() => getAiConfig(), []) ?? null;
}
