import { CEFR_LEVELS, ERROR_TYPE_LABEL, SKILLS, SKILL_LABEL, type Assessment, type Cefr, type ErrorEntry, type Session, type Skill, type TimeBlock } from '../db/types';
import { addDays, localDate, weekStart } from '../db/rules';
import { tr, trf } from '../i18n';

/** Sub-level index: A1=0, A1+=0.5 … used only to compare skills, never shown as a precise score. */
export function levelIndex(a: Pick<Assessment, 'level' | 'modifier'>): number {
  const base = CEFR_LEVELS.indexOf(a.level);
  return base + (a.modifier === '+' ? 0.33 : a.modifier === '-' ? -0.33 : 0);
}
export const fmtLevel = (a: Pick<Assessment, 'level' | 'modifier'>) => `${a.level}${a.modifier ?? ''}`;

export function latestBySkill(list: Assessment[]): Partial<Record<Skill, Assessment>> {
  const out: Partial<Record<Skill, Assessment>> = {};
  for (const a of [...list].sort((x, y) => x.date.localeCompare(y.date))) out[a.skill] = a;
  return out;
}

export interface Suggestion { text: string; why: string }

/** Rule-based next-step suggestions from ability evidence + error bank. */
export function suggestions(latest: Partial<Record<Skill, Assessment>>, errors: ErrorEntry[], target: Cefr, now = new Date()): Suggestion[] {
  const out: Suggestion[] = [];
  const assessed = SKILLS.filter((s) => latest[s]);
  const missing = SKILLS.filter((s) => !latest[s]);
  if (missing.length) out.push({ text: trf('完成 {0} 的分项诊断', missing.map((s) => SKILL_LABEL[s]).join(tr('、'))), why: tr('这些能力还没有任何证据，系统无法判断水平') });
  if (assessed.length >= 2) {
    const idx = assessed.map((s) => ({ s, i: levelIndex(latest[s]!) }));
    const max = Math.max(...idx.map((x) => x.i));
    for (const x of idx) {
      if (max - x.i >= 0.66) out.push({ text: trf('下周提高{0}的时间占比', SKILL_LABEL[x.s]), why: trf('{0} {1}，比最强项低一个子级以上', SKILL_LABEL[x.s], fmtLevel(latest[x.s]!)) });
    }
  }
  const t = CEFR_LEVELS.indexOf(target);
  for (const s of assessed) {
    const days = (now.getTime() - Date.parse(latest[s]!.date)) / 86400000;
    if (days > 56) out.push({ text: trf('重新评估{0}', SKILL_LABEL[s]), why: trf('上次评估是 {0} 天前', Math.floor(days)) });
    if (levelIndex(latest[s]!) >= t) out.push({ text: trf('{0}已到 {1}，可开始向下一级过渡', SKILL_LABEL[s], target), why: tr('保持该项输入，同时把时间分给较弱的能力') });
  }
  const open = errors.filter((e) => e.status !== 'verified');
  const byType = new Map<string, number>();
  for (const e of open) byType.set(e.errorType, (byType.get(e.errorType) ?? 0) + e.occurrences.length);
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) out.push({ text: trf('针对「{0}」类错误做专项练习', ERROR_TYPE_LABEL[top[0] as keyof typeof ERROR_TYPE_LABEL] ?? top[0]), why: trf('未解决的这类错误已出现 {0} 次', top[1]) });
  return out;
}

export function weekMinutes(sessions: Session[], blocks: TimeBlock[], ws = weekStart()) {
  const end = addDays(ws, 7);
  const inWeek = sessions.filter((s) => {
    const d = localDate(new Date(s.startedAt));
    return d >= ws && d < end;
  });
  const actual = inWeek.reduce((a, s) => a + s.minutes, 0);
  const planned = blocks.filter((b) => b.weekStart === ws).reduce((a, b) => a + b.plannedMinutes, 0);
  const byActivity: Record<string, number> = {};
  for (const s of inWeek) byActivity[s.activityType] = (byActivity[s.activityType] ?? 0) + s.minutes;
  return { actual, planned, byActivity, sessions: inWeek };
}

/** Minutes per week for the last n weeks, oldest first. */
export function weeklyHistory(sessions: Session[], n = 8) {
  const cur = weekStart();
  return Array.from({ length: n }, (_, i) => {
    const ws = addDays(cur, -7 * (n - 1 - i));
    return { ws, minutes: weekMinutes(sessions, [], ws).actual };
  });
}
