import { useState } from 'react';
import type { ItemType } from '../db/types';
import { KIND_LABEL } from '../io/aiImport';
import { cx } from '../ui/kit';
import { tr } from '../i18n';

export const STUDY_TYPES = ['vocab', 'expression', 'sentence', 'grammar', 'error'] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

/** Remembered per page ("learn" / "review"); '' = everything. */
export function useTypeChoice(page: string) {
  const key = `flos-types-${page}`;
  const read = (): StudyType | '' => { try { return (localStorage.getItem(key) as StudyType | null) ?? ''; } catch { return ''; } };
  const [t, setT] = useState<StudyType | ''>(read);
  const set = (v: StudyType | '') => { setT(v); try { localStorage.setItem(key, v); } catch { /* private mode */ } };
  return [t, set, t ? ([t] as ItemType[]) : undefined] as const;
}

export function TypeFilter({ value, onChange, counts }: { value: StudyType | ''; onChange: (v: StudyType | '') => void; counts: Partial<Record<ItemType, number>> }) {
  const total = STUDY_TYPES.reduce((n, t) => n + (counts[t] ?? 0), 0);
  const chip = (v: StudyType | '', label: string, n: number) => (
    <button key={v || 'all'} onClick={() => onChange(v)} aria-pressed={value === v}
      className={cx('rounded-full border px-3 py-1 text-sm', value === v ? 'border-ink bg-ink text-paper' : 'border-line text-muted', !n && value !== v && 'opacity-50')}>
      {label} <span className={value === v ? 'text-paper/70' : 'text-faint'}>{n}</span>
    </button>
  );
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={tr('内容类型')}>
      {chip('', tr('全部'), total)}
      {STUDY_TYPES.map((t) => chip(t, KIND_LABEL[t], counts[t] ?? 0))}
    </div>
  );
}
