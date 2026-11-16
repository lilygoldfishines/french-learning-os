/**
 * French conjugation, offline. Data: french-verbs-lefff (Lefff lexicon, 7.8k verbs), engine: french-verbs.
 * Loaded lazily (≈1 MB gzipped) the first time a conjugation feature is opened.
 */
export const TENSES = [
  'PRESENT', 'PASSE_COMPOSE', 'IMPARFAIT', 'PLUS_QUE_PARFAIT', 'FUTUR', 'CONDITIONNEL_PRESENT', 'SUBJONCTIF_PRESENT',
  'IMPERATIF_PRESENT', 'PASSE_SIMPLE',
] as const;
export type Tense = (typeof TENSES)[number];
export const DEFAULT_PRACTICE_TENSES: Tense[] = ['PRESENT', 'PASSE_COMPOSE', 'IMPARFAIT', 'FUTUR'];

export const TENSE_LABEL: Record<Tense, { zh: string; fr: string; level: string }> = {
  PRESENT: { zh: '现在时', fr: 'présent', level: 'A1' },
  PASSE_COMPOSE: { zh: '复合过去时', fr: 'passé composé', level: 'A2' },
  IMPARFAIT: { zh: '未完成过去时', fr: 'imparfait', level: 'A2' },
  PLUS_QUE_PARFAIT: { zh: '愈过去时', fr: 'plus-que-parfait', level: 'B1' },
  FUTUR: { zh: '简单将来时', fr: 'futur simple', level: 'A2' },
  CONDITIONNEL_PRESENT: { zh: '条件式现在时', fr: 'conditionnel présent', level: 'B1' },
  SUBJONCTIF_PRESENT: { zh: '虚拟式现在时', fr: 'subjonctif présent', level: 'B1' },
  IMPERATIF_PRESENT: { zh: '命令式', fr: 'impératif', level: 'A2' },
  PASSE_SIMPLE: { zh: '简单过去时（认读）', fr: 'passé simple', level: 'B2' },
};

/** Short memory rules shown next to tables and after each answer. Written for this app. */
export const TENSE_RULE: Record<Tense, string> = {
  PRESENT: '-er：-e -es -e -ons -ez -ent。第二组 -ir（finir）：-is -is -it -issons -issez -issent。第三组多不规则，要逐个记。',
  PASSE_COMPOSE: 'avoir / être 的现在时 + 过去分词。用 être 的：表示位移或状态变化的一小组动词（aller, venir, partir, naître, mourir…）和所有代词式动词；这时过去分词要和主语性数配合。',
  IMPARFAIT: '取 nous 现在时，去掉 -ons，加 -ais -ais -ait -ions -iez -aient。唯一例外：être → ét-。',
  PLUS_QUE_PARFAIT: 'avoir / être 的未完成过去时 + 过去分词。配合规则同复合过去时。',
  FUTUR: '不定式（-re 去掉 e）+ -ai -as -a -ons -ez -ont。不规则词干：ser- aur- ir- fer- pourr- voudr- devr- saur- viendr- verr- enverr-。',
  CONDITIONNEL_PRESENT: '将来时的词干 + 未完成过去时的词尾 -ais -ais -ait -ions -iez -aient。',
  SUBJONCTIF_PRESENT: '取 ils 现在时，去掉 -ent，加 -e -es -e -ions -iez -ent；nous / vous 常与未完成过去时同形。不规则：sois, aie, aille, fasse, puisse, sache, veuille。',
  IMPERATIF_PRESENT: '只有 tu / nous / vous，用现在时去掉主语。-er 动词的 tu 形去掉 s（Parle !）。不规则：sois, aie, sache, veuille。',
  PASSE_SIMPLE: '书面叙述用的过去时，小说和新闻里常见。阅读时认得即可，口语和写作一般用复合过去时。',
};

export const PERSONS = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] as const;
export const IMPERATIVE_PERSONS = [1, 3, 4];

export interface Form { person: number; pronoun: string; form: string; full: string; alts: string[]; irregular: boolean }
export interface TenseTable { tense: Tense; aux?: 'avoir' | 'être'; forms: Form[] }
export interface VerbTable { verb: string; infinitive: string; pronominal: boolean; group: 1 | 2 | 3; participle: string; tables: TenseTable[] }

type Lib = { getConjugation: (...a: unknown[]) => string };
let loaded: Promise<{ lib: Lib; data: Record<string, unknown> }> | null = null;
export function loadConjugator() {
  loaded ??= Promise.all([import('french-verbs'), import('french-verbs-lefff/dist/conjugations.json')]).then(([lib, data]) => ({
    lib: ((lib as unknown as { default?: Lib }).default ?? lib) as Lib,
    data: ((data as unknown as { default?: Record<string, unknown> }).default ?? data) as Record<string, unknown>,
  }));
  return loaded;
}

const H_ASPIRE = new Set(['haïr', 'hurler', 'heurter', 'hacher', 'haleter', 'hanter', 'harceler', 'hasarder', 'hâter', 'hausser', 'hisser', 'huer', 'hocher', 'hennir', 'héler', 'hérisser']);
const elides = (word: string, verb: string) => /^[aeiouyéèêàâîïôûœ]/i.test(word) || (/^h/i.test(word) && !H_ASPIRE.has(verb));

export function parseVerb(input: string): { infinitive: string; pronominal: boolean } {
  const s = input.trim().toLowerCase().replace(/’/g, "'");
  const m = s.match(/^(?:se\s+|s')(.+)$/);
  return m ? { infinitive: m[1].trim(), pronominal: true } : { infinitive: s, pronominal: false };
}

export function verbGroup(inf: string, data?: Record<string, unknown>): 1 | 2 | 3 {
  if (inf.endsWith('er') && inf !== 'aller') return 1;
  if (inf.endsWith('ir') && data) {
    const p = (data[inf] as { P?: string[] } | undefined)?.P;
    if (p?.[3]?.endsWith('issons')) return 2;
  }
  return 3;
}

const REG: Record<1 | 2, Partial<Record<Tense, string[]>>> = {
  1: {
    PRESENT: ['e', 'es', 'e', 'ons', 'ez', 'ent'], IMPARFAIT: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    SUBJONCTIF_PRESENT: ['e', 'es', 'e', 'ions', 'iez', 'ent'], IMPERATIF_PRESENT: ['', 'e', '', 'ons', 'ez', ''],
    PASSE_SIMPLE: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'],
  },
  2: {
    PRESENT: ['is', 'is', 'it', 'issons', 'issez', 'issent'], IMPARFAIT: ['issais', 'issais', 'issait', 'issions', 'issiez', 'issaient'],
    SUBJONCTIF_PRESENT: ['isse', 'isses', 'isse', 'issions', 'issiez', 'issent'], IMPERATIF_PRESENT: ['', 'is', '', 'issons', 'issez', ''],
    PASSE_SIMPLE: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'],
  },
};
const FUT = ['ai', 'as', 'a', 'ons', 'ez', 'ont'], COND = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];
/** The textbook regular form for -er / -ir(issons) verbs; null for the third group (no single model). */
function regularForm(group: 1 | 2 | 3, tense: Tense, person: number, inf: string): string | null {
  if (group === 3) return null;
  const stem = inf.slice(0, -2);
  if (tense === 'FUTUR') return inf + FUT[person];
  if (tense === 'CONDITIONNEL_PRESENT') return inf + COND[person];
  if (tense === 'PASSE_COMPOSE' || tense === 'PLUS_QUE_PARFAIT') return stem + (group === 1 ? 'é' : 'i');
  const e = REG[group][tense]?.[person];
  return e === undefined ? null : stem + e;
}

/** Bare form (no subject pronoun) → full sentence-start form with the right pronoun / elision / "que". */
function withPronoun(person: number, bare: string, tense: Tense, verb: string): { pronoun: string; full: string } {
  if (tense === 'IMPERATIF_PRESENT') return { pronoun: '', full: bare };
  let p: string = PERSONS[person];
  if (person === 0 && elides(bare, verb)) p = "j'";
  const que = tense === 'SUBJONCTIF_PRESENT' ? (/^[aeiouyé]/i.test(p) || p.startsWith('il') || p.startsWith('elle') ? "qu'" : 'que ') : '';
  const joint = p.endsWith("'") ? '' : ' ';
  return { pronoun: p, full: `${que}${p}${joint}${bare}` };
}

export async function conjugate(input: string, tenses: readonly Tense[] = TENSES): Promise<VerbTable | null> {
  const { lib, data } = await loadConjugator();
  const { infinitive, pronominal } = parseVerb(input);
  if (!data[infinitive]) return null;
  // stem for spotting forms that need memorising: parler→parl, finir→fin, prendre→prend, pouvoir→pouv
  const stem = infinitive.endsWith('oir') ? infinitive.slice(0, -3) : infinitive.slice(0, -2);
  const group = verbGroup(infinitive, data);
  const get = (tense: Tense, person: number, opts: Record<string, unknown>) => {
    try {
      return lib.getConjugation(data, infinitive, tense, person, { aux: null, ...opts }, pronominal, undefined, undefined, 'Act');
    } catch (e) {
      if (/aux property must be set/.test(String((e as Error).message))) {
        return lib.getConjugation(data, infinitive, tense, person, { ...opts, aux: 'AVOIR' }, pronominal, undefined, undefined, 'Act');
      }
      throw e;
    }
  };
  const tables: TenseTable[] = [];
  for (const tense of tenses) {
    const persons = tense === 'IMPERATIF_PRESENT' ? IMPERATIVE_PERSONS : [0, 1, 2, 3, 4, 5];
    const forms: Form[] = [];
    let aux: TenseTable['aux'];
    for (const person of persons) {
      const plural = person >= 3;
      let bare: string;
      try {
        bare = get(tense, person, { agreeNumber: plural ? 'P' : 'S' });
      } catch {
        continue;
      }
      if (!bare || bare === 'NA') continue;
      const alts = new Set<string>();
      if (tense === 'PASSE_COMPOSE' || tense === 'PLUS_QUE_PARFAIT') {
        aux = /^(?:(?:me|te|se|nous|vous|m'|t'|s')\s*)?(?:suis|es|est|sommes|êtes|sont|étais|était|étions|étiez|étaient)\b/.test(bare) ? 'être' : 'avoir';
        if (aux === 'être') {
          try { alts.add(get(tense, person, { agreeNumber: plural ? 'P' : 'S', agreeGender: 'F' })); } catch { /* ignore */ }
        }
      }
      const { pronoun, full } = withPronoun(person, bare, tense, infinitive);
      const core = bare.replace(/^(?:me |te |se |nous |vous |m'|t'|s')/, '').split(' ').pop() ?? bare;
      const regular = regularForm(group, tense, person, infinitive);
      const irregular = regular !== null
        ? (tense === 'PASSE_COMPOSE' || tense === 'PLUS_QUE_PARFAIT' ? !core.startsWith(regular) : core !== regular)
        : tense === 'FUTUR' || tense === 'CONDITIONNEL_PRESENT'
          ? !core.startsWith(infinitive.replace(/e$/, ''))
          : !core.startsWith(stem);
      forms.push({ person, pronoun, form: bare, full, alts: [...alts].filter((a) => a !== bare), irregular });
    }
    if (forms.length) tables.push({ tense, aux, forms });
  }
  let participle = '';
  try { participle = lib.getConjugation(data, infinitive, 'PARTICIPE_PASSE', 0, { aux: null }, false, undefined, undefined, 'Act'); } catch { /* ignore */ }
  return { verb: pronominal ? (elides(infinitive, infinitive) ? `s'${infinitive}` : `se ${infinitive}`) : infinitive, infinitive, pronominal, group, participle, tables };
}

export const normalizeAnswer = (s: string) =>
  s.toLowerCase().replace(/[’`´]/g, "'").replace(/[.!?…]+$/g, '').replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export type Verdict = 'correct' | 'accent' | 'wrong';
/** Accepts the bare form ("avons pris"), with pronoun ("nous avons pris") or, for the subjunctive, with "que". */
export function checkAnswer(answer: string, f: Form): Verdict {
  const a = normalizeAnswer(answer);
  if (!a) return 'wrong';
  const variants = new Set<string>();
  for (const bare of [f.form, ...f.alts]) {
    const full = f.full.replace(f.form, bare);
    variants.add(normalizeAnswer(bare));
    variants.add(normalizeAnswer(full));
    variants.add(normalizeAnswer(full.replace(/^que |^qu'/, '')));
    if (f.pronoun === 'il/elle' || f.pronoun === 'ils/elles') {
      for (const p of f.pronoun.split('/')) variants.add(normalizeAnswer(full.replace(f.pronoun, p)));
      for (const p of f.pronoun.split('/')) variants.add(normalizeAnswer(full.replace(f.pronoun, p).replace(/^que |^qu'/, '')));
    }
  }
  if (variants.has(a)) return 'correct';
  const plain = stripAccents(a);
  for (const v of variants) if (stripAccents(v) === plain) return 'accent';
  return 'wrong';
}

/** Core verbs offered as a starter pack: the most frequent irregular verbs plus one model per regular pattern. */
export const STARTER_VERBS = [
  'être', 'avoir', 'aller', 'faire', 'dire', 'pouvoir', 'vouloir', 'devoir', 'savoir', 'venir', 'prendre', 'mettre', 'voir',
  'croire', 'tenir', 'vivre', 'connaître', 'partir', 'sortir', 'écrire', 'lire', 'boire', 'recevoir', 'ouvrir', 'suivre',
  'parler', 'finir', 'acheter', 'appeler', 'manger', 'commencer', 'payer', 'préférer', 'se lever',
];
