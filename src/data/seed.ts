import type { Cefr, Skill } from '../db/types';

/** Starter grammar catalogue (names + level + category). Explanations are filled in later by the learner / AI import. */
export const GRAMMAR_SEED: { name: string; cefr: Cefr; category: string }[] = [
  // A1
  { name: '定冠词与不定冠词 Articles définis et indéfinis', cefr: 'A1', category: '冠词' },
  { name: '名词的阴阳性 Genre des noms', cefr: 'A1', category: '名词' },
  { name: '名词复数 Pluriel des noms', cefr: 'A1', category: '名词' },
  { name: '形容词性数配合 Accord de l’adjectif', cefr: 'A1', category: '形容词' },
  { name: '主语人称代词 Pronoms sujets', cefr: 'A1', category: '代词' },
  { name: '直陈式现在时 Présent de l’indicatif', cefr: 'A1', category: '时态' },
  { name: '简单否定 ne… pas', cefr: 'A1', category: '否定' },
  { name: '疑问句三种形式 Les trois formes interrogatives', cefr: 'A1', category: '疑问' },
  { name: '主有形容词 Adjectifs possessifs', cefr: 'A1', category: '限定词' },
  { name: '指示形容词 Adjectifs démonstratifs', cefr: 'A1', category: '限定词' },
  // A2
  { name: '部分冠词 Articles partitifs', cefr: 'A2', category: '冠词' },
  { name: '复合过去时 Passé composé（avoir / être）', cefr: 'A2', category: '时态' },
  { name: '过去分词配合 Accord du participe passé', cefr: 'A2', category: '时态' },
  { name: '未完成过去时 Imparfait', cefr: 'A2', category: '时态' },
  { name: '最近将来时 / 最近过去时 Futur proche, passé récent', cefr: 'A2', category: '时态' },
  { name: '代词式动词 Verbes pronominaux', cefr: 'A2', category: '动词' },
  { name: '直接宾语代词 COD : le, la, les', cefr: 'A2', category: '代词' },
  { name: '间接宾语代词 COI : lui, leur', cefr: 'A2', category: '代词' },
  { name: '代词 y 与 en', cefr: 'A2', category: '代词' },
  { name: '比较级与最高级 Comparatif et superlatif', cefr: 'A2', category: '形容词' },
  { name: '其他否定 ne… jamais / plus / rien / personne', cefr: 'A2', category: '否定' },
  { name: '简单关系代词 qui, que', cefr: 'A2', category: '从句' },
  // B1
  { name: '简单将来时 Futur simple', cefr: 'B1', category: '时态' },
  { name: '条件式现在时 Conditionnel présent', cefr: 'B1', category: '语式' },
  { name: '复合过去时与未完成过去时的选择 PC vs imparfait', cefr: 'B1', category: '时态' },
  { name: '愈过去时 Plus-que-parfait', cefr: 'B1', category: '时态' },
  { name: '虚拟式现在时（基础）Subjonctif présent', cefr: 'B1', category: '语式' },
  { name: '关系代词 dont, où', cefr: 'B1', category: '从句' },
  { name: '代词组合顺序 Double pronoms', cefr: 'B1', category: '代词' },
  { name: '间接引语（现在）Discours indirect au présent', cefr: 'B1', category: '句法' },
  { name: '假设句 Si + présent / imparfait', cefr: 'B1', category: '条件' },
  { name: '副动词 Gérondif', cefr: 'B1', category: '动词' },
  { name: '常用介词与动词搭配 Verbes + à / de', cefr: 'B1', category: '介词' },
  { name: '强调句 C’est… qui / que', cefr: 'B1', category: '句法' },
  // B2
  { name: '虚拟式的触发条件 Emplois du subjonctif', cefr: 'B2', category: '语式' },
  { name: '虚拟式过去时 Subjonctif passé', cefr: 'B2', category: '语式' },
  { name: '条件式过去时 Conditionnel passé', cefr: 'B2', category: '语式' },
  { name: '假设句 Si + plus-que-parfait', cefr: 'B2', category: '条件' },
  { name: '复合关系代词 lequel, auquel, duquel', cefr: 'B2', category: '从句' },
  { name: '间接引语与时态配合 Concordance des temps', cefr: 'B2', category: '句法' },
  { name: '被动语态 Voix passive', cefr: 'B2', category: '句法' },
  { name: '现在分词与形容词 Participe présent, adjectif verbal', cefr: 'B2', category: '动词' },
  { name: '让步表达 Concession : bien que, quoique, même si', cefr: 'B2', category: '逻辑' },
  { name: '原因与结果 Cause et conséquence', cefr: 'B2', category: '逻辑' },
  { name: '目的与对立 But et opposition', cefr: 'B2', category: '逻辑' },
  { name: '名词化 Nominalisation', cefr: 'B2', category: '语篇' },
  { name: '前将来时 Futur antérieur', cefr: 'B2', category: '时态' },
  // C1
  { name: '高级虚拟式用法 Subjonctif après superlatif, relatives', cefr: 'C1', category: '语式' },
  { name: '复杂条件结构 Hypothèse sans si', cefr: 'C1', category: '条件' },
  { name: '简单过去时（识别）Passé simple', cefr: 'C1', category: '时态' },
  { name: '语篇衔接与指代 Cohésion et anaphore', cefr: 'C1', category: '语篇' },
  { name: '高级连接词 Connecteurs argumentatifs', cefr: 'C1', category: '语篇' },
  { name: '分离与倒装 Dislocation, inversion stylistique', cefr: 'C1', category: '句法' },
  { name: '虚词 ne 与 ne explétif', cefr: 'C1', category: '否定' },
  { name: '情态与语气弱化 Modalisation', cefr: 'C1', category: '语篇' },
  // C2
  { name: '未完成虚拟式（识别）Subjonctif imparfait', cefr: 'C2', category: '语式' },
  { name: '修辞性句式 Figures de style syntaxiques', cefr: 'C2', category: '语篇' },
  { name: '语法与语义的细微差异 Nuances sémantiques', cefr: 'C2', category: '语义' },
  { name: '书面语与文学结构 Structures littéraires', cefr: 'C2', category: '句法' },
];

/**
 * Short can-do descriptors per level and skill, written for this app as a practical summary of the CEFR scale.
 * They are a checklist aid, not the official Council of Europe wording.
 */
export const DESCRIPTORS: Record<Cefr, Record<Skill, string[]>> = {
  A1: {
    listening: ['听懂缓慢清晰的自我介绍和简单指示', '听懂数字、价格、时间'],
    speaking: ['用简单句介绍自己和他人', '在对方配合下进行简单问答'],
    reading: ['看懂标识、表格和非常短的信息', '看懂熟悉主题的简单句子'],
    writing: ['填写个人信息表格', '写简短的明信片或便条'],
  },
  A2: {
    listening: ['听懂日常话题的简短对话', '抓住简短广播通知的要点'],
    speaking: ['应付购物、预约、问路等日常交流', '用简单连接词描述经历和计划'],
    reading: ['看懂简短的个人信件和日常文本', '在广告、菜单、时刻表中找到具体信息'],
    writing: ['写简短的个人信息和感谢信', '用简单连接词描述事件'],
  },
  B1: {
    listening: ['听懂熟悉话题中语速正常的标准语要点', '听懂广播和视频中关于时事或兴趣话题的主要信息'],
    speaking: ['应对大部分旅行和生活中的情境', '讲述经历、梦想，并简要说明理由'],
    reading: ['看懂与生活和工作相关的常见文本', '看懂私人信件中对事件和感受的描述'],
    writing: ['就熟悉话题写连贯的简单文章', '写信描述经历和感受'],
  },
  B2: {
    listening: ['听懂较长的讲话和论证，跟得上复杂论点', '看懂大部分电视新闻和时事节目，以及标准语电影'],
    speaking: ['与母语者自然流利地交流，不让双方吃力', '就广泛话题清晰陈述观点，并比较利弊'],
    reading: ['看懂作者表明立场的时事文章和报告', '看懂当代文学散文'],
    writing: ['写清晰详细的论证文章，支持或反对某一观点', '写信说明事件或经历对自己的意义'],
  },
  C1: {
    listening: ['听懂结构不清晰、关系隐含的长篇讲话', '轻松看懂电视节目和电影'],
    speaking: ['流利、即兴表达，几乎不用找词', '在社交和职业场合灵活有效地使用语言'],
    reading: ['看懂长而复杂的事实性和文学性文本，体会风格差异', '看懂专业文章和长篇技术说明'],
    writing: ['结构清晰地论述复杂主题，突出重点', '根据读者调整文体'],
  },
  C2: {
    listening: ['听懂任何形式的口语，包括快速的母语语速', '理解口音和隐含意义'],
    speaking: ['精确表达细微的意义差别', '自如运用习语和口语表达'],
    reading: ['轻松阅读几乎所有形式的书面语，包括抽象和结构复杂的文本'],
    writing: ['写清晰流畅、文体得当的复杂文本', '写评论和文学作品评析'],
  },
};
