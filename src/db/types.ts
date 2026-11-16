import { tr } from '../i18n';
// Core types for French Learning OS. Every stored record carries SystemFields.

export interface SystemFields {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  deletedAt?: string | null; // soft delete (needed for sync)
  rev: number; // edit counter, used for conflict detection
}

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

export const SKILLS = ['listening', 'speaking', 'reading', 'writing'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABEL: Record<Skill, string> = {
  listening: tr('听力'),
  speaking: tr('口语'),
  reading: tr('阅读'),
  writing: tr('写作'),
};

export const GENDERS = ['m', 'f', 'm-f', 'none'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { m: tr('阳性 m.'), f: tr('阴性 f.'), 'm-f': tr('阴阳同形'), none: '—' };

export const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'determiner', 'interjection', 'phrase'] as const;
export type Pos = (typeof POS)[number];
export const POS_LABEL: Record<Pos, string> = {
  noun: tr('名词 n.'), verb: tr('动词 v.'), adjective: tr('形容词 adj.'), adverb: tr('副词 adv.'), preposition: tr('介词 prép.'),
  conjunction: tr('连词 conj.'), pronoun: tr('代词 pron.'), determiner: tr('限定词 dét.'), interjection: tr('感叹词 interj.'), phrase: tr('短语 loc.'),
};

export const VOCAB_TOPICS = [
  'daily', 'food', 'transport', 'health', 'housing', 'admin', 'finance', 'relationships', 'work', 'cinema',
  'art', 'society', 'academic', 'literature', 'abstract', 'news', 'idioms',
] as const;
export const TOPIC_LABEL: Record<string, string> = {
  daily: tr('日常生活'), food: tr('食物与餐饮'), transport: tr('交通'), health: tr('医疗'), housing: tr('住房'), admin: tr('法国行政'),
  finance: tr('金融'), relationships: tr('人际关系'), work: tr('工作与商务'), cinema: tr('电影制作'), art: tr('艺术与文化'),
  society: tr('社会与政治'), academic: tr('学术法语'), literature: tr('文学与哲学'), abstract: tr('抽象概念'), news: tr('新闻与评论'), idioms: tr('习语与固定表达'),
};

export const LEARN_STATUS = ['new', 'learning', 'familiar', 'mastered'] as const;
export type LearnStatus = (typeof LEARN_STATUS)[number];
export const LEARN_STATUS_LABEL: Record<LearnStatus, string> = { new: tr('新词'), learning: tr('学习中'), familiar: tr('熟悉'), mastered: tr('掌握') };

export interface Example { fr: string; en?: string; zh?: string }

export interface Vocab extends SystemFields {
  lemma: string;
  article?: string; // le, la, l', les, un, une...
  gender: Gender;
  plural?: string;
  pos: Pos;
  ipa?: string;
  audioUrl?: string;
  defEn?: string;
  defZh?: string;
  examples: Example[];
  synonyms: string[];
  antonyms: string[];
  related: string[];
  collocations: string[];
  prepositions: string[];
  conjugation?: string;
  topics: string[];
  cefr?: Cefr;
  status: LearnStatus;
  notes?: string;
}

export interface Grammar extends SystemFields {
  name: string;
  cefr: Cefr;
  category: string;
  explanationEn?: string;
  explanationZh?: string;
  structure?: string;
  conditions?: string;
  correctExamples: string[];
  incorrectExamples: string[];
  commonErrors?: string;
  exceptions?: string;
  mastery: number; // 0-4
  skipped: boolean;
  notes?: string;
}

export const REGISTERS = ['courant', 'soutenu', 'familier', 'argotique', 'professionnel', 'littéraire'] as const;
export const REGISTER_LABEL: Record<string, string> = {
  courant: tr('标准 courant'), soutenu: tr('正式 soutenu'), familier: tr('口语 familier'), argotique: tr('俚语 argotique'),
  professionnel: tr('专业 professionnel'), littéraire: tr('文学 littéraire'),
};
export const NATURALNESS = ['correct', 'correct-unnatural', 'natural', 'formal-ok', 'informal-ok', 'inappropriate'] as const;
export const NATURALNESS_LABEL: Record<string, string> = {
  correct: tr('语法正确'), 'correct-unnatural': tr('正确但不自然'), natural: tr('自然地道'), 'formal-ok': tr('适合正式语境'),
  'informal-ok': tr('适合非正式语境'), inappropriate: tr('当前语境不适用'),
};
export const EXPRESSION_CATEGORIES = [
  'daily', 'spoken', 'formal', 'informal', 'french-local', 'idiom', 'collocation', 'pattern', 'connector', 'logic', 'professional', 'literary',
] as const;
export const EXPR_CAT_LABEL: Record<string, string> = {
  daily: tr('日常表达'), spoken: tr('口语表达'), formal: tr('正式表达'), informal: tr('非正式表达'), 'french-local': tr('法国本土表达'),
  idiom: tr('习语'), collocation: tr('固定搭配'), pattern: tr('常见句型'), connector: tr('论述连接词'), logic: tr('逻辑表达'),
  professional: tr('专业表达'), literary: tr('文学性表达'),
};

export interface Expression extends SystemFields {
  text: string;
  defEn?: string;
  defZh?: string;
  context?: string;
  register?: string;
  category?: string;
  examples: Example[];
  dialogue?: string;
  naturalness?: string;
  notes?: string;
}

export interface Sentence extends SystemFields {
  fr: string;
  en?: string;
  zh?: string;
  source?: string;
  notes?: string;
}

export const ERROR_TYPES = [
  'gender', 'article', 'conjugation', 'agreement', 'preposition', 'word-choice', 'structure', 'word-order', 'spelling',
  'pronunciation', 'unnatural', 'register',
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {
  gender: tr('阴阳性'), article: tr('冠词'), conjugation: tr('动词变位'), agreement: tr('主谓/性数一致'), preposition: tr('介词'),
  'word-choice': tr('词汇误用'), structure: tr('句子结构'), 'word-order': tr('词序'), spelling: tr('拼写'), pronunciation: tr('发音'),
  unnatural: tr('不自然表达'), register: tr('语体错误'),
};
export const ERROR_STATUS = ['open', 'practicing', 'verified'] as const;
export type ErrorStatus = (typeof ERROR_STATUS)[number];
export const ERROR_STATUS_LABEL: Record<ErrorStatus, string> = { open: tr('未解决'), practicing: tr('练习中'), verified: tr('已验证解决') };

export interface Occurrence { date: string; source?: string }
export interface ErrorEntry extends SystemFields {
  original: string;
  corrected: string;
  explanation?: string;
  errorType: ErrorType;
  grammarRef?: string; // free-text grammar point name (also linked via link table)
  occurrences: Occurrence[];
  correctUses: string[]; // ISO dates of later correct use
  status: ErrorStatus;
  notes?: string;
}

export interface Link extends SystemFields {
  fromType: ItemType;
  fromId: string;
  toType: ItemType;
  toId: string;
  relation: string;
}

/** 'conj' cards: itemId = "<verb>|<TENSE>" — practised on the conjugation page, not in the main review. */
export type ItemType = 'vocab' | 'grammar' | 'expression' | 'sentence' | 'error' | 'conj';

export interface CardRecord extends SystemFields {
  itemType: ItemType;
  itemId: string;
  direction: 'recognize' | 'produce';
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string | null;
  suspended: boolean;
}

export interface ReviewLog extends SystemFields {
  cardId: string;
  rating: number; // 1-4
  reviewedAt: string;
  stateBefore: number;
  scheduledDays: number;
  elapsedDays: number;
}

export const GOAL_SCOPES = ['long', 'month', 'week'] as const;
export type GoalScope = (typeof GOAL_SCOPES)[number];
export interface Goal extends SystemFields {
  scope: GoalScope;
  period: string; // long: free text, month: 2026-11, week: monday ISO date
  title: string;
  targetMinutes?: number;
  skillFocus: Skill[];
  done: boolean;
}

export const ACTIVITY_TYPES = ['active', 'passive', 'review', 'interaction', 'exam', 'culture'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  active: tr('主动学习'), passive: tr('被动输入'), review: tr('间隔复习'), interaction: tr('实际交流'), exam: tr('考试准备'), culture: tr('文化沉浸'),
};

export interface TimeBlock extends SystemFields {
  weekStart: string; // monday yyyy-mm-dd
  day: number; // 0=Mon..6
  plannedMinutes: number;
  activityType: ActivityType;
  skill?: Skill | 'mixed';
  note?: string;
}

export interface Session extends SystemFields {
  startedAt: string;
  minutes: number;
  activityType: ActivityType;
  skill?: Skill | 'mixed';
  notes?: string;
  outcome?: string;
}

export const EVIDENCE_TYPES = ['writing-sample', 'speaking-recording', 'mock-exam', 'official-exam', 'teacher', 'self'] as const;
export const EVIDENCE_LABEL: Record<string, string> = {
  'writing-sample': tr('写作样本'), 'speaking-recording': tr('口语录音'), 'mock-exam': tr('模拟考试'), 'official-exam': tr('正式考试'),
  teacher: tr('老师评估'), self: tr('自我评估（证据较弱）'),
};

export interface Assessment extends SystemFields {
  date: string;
  skill: Skill;
  level: Cefr;
  modifier?: '-' | '' | '+';
  evidenceType: string;
  evidenceRef?: string;
  descriptorsMet: string[];
  notes?: string;
}

export interface Retro extends SystemFields {
  scope: 'week' | 'month';
  period: string;
  wentWell?: string;
  problems?: string;
  adjustNext?: string;
}

export interface Settings {
  dailyNewLimit: number;
  dailyReviewLimit: number;
  retention: number;
  weeklyTargetMinutes: number;
  targetLevel: Cefr;
  targetDate: string;
  conjNewLimit: number;
}

export interface MetaRow { key: string; value: unknown }

export const DEFAULT_SETTINGS: Settings = {
  dailyNewLimit: 15,
  dailyReviewLimit: 150,
  retention: 0.9,
  weeklyTargetMinutes: 600,
  targetLevel: 'B2',
  targetDate: '2027-05-31',
  conjNewLimit: 10,
};
