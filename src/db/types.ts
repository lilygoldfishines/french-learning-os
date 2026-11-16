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
  listening: '听力',
  speaking: '口语',
  reading: '阅读',
  writing: '写作',
};

export const GENDERS = ['m', 'f', 'm-f', 'none'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { m: '阳性 m.', f: '阴性 f.', 'm-f': '阴阳同形', none: '—' };

export const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'determiner', 'interjection', 'phrase'] as const;
export type Pos = (typeof POS)[number];
export const POS_LABEL: Record<Pos, string> = {
  noun: '名词 n.', verb: '动词 v.', adjective: '形容词 adj.', adverb: '副词 adv.', preposition: '介词 prép.',
  conjunction: '连词 conj.', pronoun: '代词 pron.', determiner: '限定词 dét.', interjection: '感叹词 interj.', phrase: '短语 loc.',
};

export const VOCAB_TOPICS = [
  'daily', 'food', 'transport', 'health', 'housing', 'admin', 'finance', 'relationships', 'work', 'cinema',
  'art', 'society', 'academic', 'literature', 'abstract', 'news', 'idioms',
] as const;
export const TOPIC_LABEL: Record<string, string> = {
  daily: '日常生活', food: '食物与餐饮', transport: '交通', health: '医疗', housing: '住房', admin: '法国行政',
  finance: '金融', relationships: '人际关系', work: '工作与商务', cinema: '电影制作', art: '艺术与文化',
  society: '社会与政治', academic: '学术法语', literature: '文学与哲学', abstract: '抽象概念', news: '新闻与评论', idioms: '习语与固定表达',
};

export const LEARN_STATUS = ['new', 'learning', 'familiar', 'mastered'] as const;
export type LearnStatus = (typeof LEARN_STATUS)[number];
export const LEARN_STATUS_LABEL: Record<LearnStatus, string> = { new: '新词', learning: '学习中', familiar: '熟悉', mastered: '掌握' };

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
  courant: '标准 courant', soutenu: '正式 soutenu', familier: '口语 familier', argotique: '俚语 argotique',
  professionnel: '专业 professionnel', littéraire: '文学 littéraire',
};
export const NATURALNESS = ['correct', 'correct-unnatural', 'natural', 'formal-ok', 'informal-ok', 'inappropriate'] as const;
export const NATURALNESS_LABEL: Record<string, string> = {
  correct: '语法正确', 'correct-unnatural': '正确但不自然', natural: '自然地道', 'formal-ok': '适合正式语境',
  'informal-ok': '适合非正式语境', inappropriate: '当前语境不适用',
};
export const EXPRESSION_CATEGORIES = [
  'daily', 'spoken', 'formal', 'informal', 'french-local', 'idiom', 'collocation', 'pattern', 'connector', 'logic', 'professional', 'literary',
] as const;
export const EXPR_CAT_LABEL: Record<string, string> = {
  daily: '日常表达', spoken: '口语表达', formal: '正式表达', informal: '非正式表达', 'french-local': '法国本土表达',
  idiom: '习语', collocation: '固定搭配', pattern: '常见句型', connector: '论述连接词', logic: '逻辑表达',
  professional: '专业表达', literary: '文学性表达',
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
  gender: '阴阳性', article: '冠词', conjugation: '动词变位', agreement: '主谓/性数一致', preposition: '介词',
  'word-choice': '词汇误用', structure: '句子结构', 'word-order': '词序', spelling: '拼写', pronunciation: '发音',
  unnatural: '不自然表达', register: '语体错误',
};
export const ERROR_STATUS = ['open', 'practicing', 'verified'] as const;
export type ErrorStatus = (typeof ERROR_STATUS)[number];
export const ERROR_STATUS_LABEL: Record<ErrorStatus, string> = { open: '未解决', practicing: '练习中', verified: '已验证解决' };

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
  active: '主动学习', passive: '被动输入', review: '间隔复习', interaction: '实际交流', exam: '考试准备', culture: '文化沉浸',
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
  'writing-sample': '写作样本', 'speaking-recording': '口语录音', 'mock-exam': '模拟考试', 'official-exam': '正式考试',
  teacher: '老师评估', self: '自我评估（证据较弱）',
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
