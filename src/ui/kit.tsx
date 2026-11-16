import type React from 'react';
import { createContext, useCallback, useContext, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { tr, trf } from '../i18n';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnKind = 'primary' | 'ghost' | 'danger' | 'plain';
export function Button({ kind = 'ghost', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-40',
        kind === 'primary' && 'bg-ink text-paper hover:bg-black',
        kind === 'ghost' && 'border border-line bg-panel hover:border-faint',
        kind === 'danger' && 'border border-line bg-panel text-bad hover:border-bad',
        kind === 'plain' && 'text-accent hover:underline px-0 py-0',
        className,
      )}
    />
  );
}

export function PageHeader({ title, sub, actions, eyebrow }: { title: string; sub?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[28px] leading-tight md:text-[34px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, children, aside, className }: { title?: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-line bg-panel p-4 md:p-5', className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          {title && <h2 className="eyebrow">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** `group`: for controls that are not a single input (button groups, lists) — a <label> must not wrap buttons. */
export function Field({ label, hint, error, children, className, group }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; group?: boolean }) {
  if (group) {
    return (
      <div role="group" aria-label={label} className={cx('block', className)}>
        <span className="mb-1 block text-xs text-muted">{label}</span>
        {children}
        {hint && !error && <span className="mt-1 block text-xs text-faint">{hint}</span>}
        {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
      </div>
    );
  }
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[15px] outline-none focus:border-accent';
export const Input = (p: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputCls, p.className)} />;
export function Select({ options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...p} className={cx(inputCls, 'pr-7', p.className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Comma / Enter separated list editor. */
export function TagsInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft('');
  };
  return (
    <div className={cx(inputCls, 'flex flex-wrap items-center gap-1.5')}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-sm">
          {t}
          <button type="button" aria-label={trf('删除 {0}', t)} className="text-muted" onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input
        aria-label={label}
        className="min-w-[6rem] flex-1 bg-transparent outline-none"
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }}
        onBlur={commit}
      />
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'm' | 'f' }) {
  const t = {
    neutral: 'border-line text-muted', good: 'border-good/30 text-good', warn: 'border-warn/30 text-warn', bad: 'border-bad/30 text-bad',
    accent: 'border-accent/30 text-accent', m: 'border-masc/30 text-masc', f: 'border-fem/30 text-fem',
  }[tone];
  return <span className={cx('inline-flex items-center rounded border px-1.5 py-px text-xs whitespace-nowrap', t)}>{children}</span>;
}

/** Dictionary-style italic tag, e.g. "n. f." — colour carries gender for nouns. */
export function GramTag({ pos, gender }: { pos: string; gender?: string }) {
  const short: Record<string, string> = {
    noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prép.', conjunction: 'conj.', pronoun: 'pron.',
    determiner: 'dét.', interjection: 'interj.', phrase: 'loc.',
  };
  const g = pos === 'noun' && gender && gender !== 'none' ? (gender === 'm-f' ? ' m./f.' : ` ${gender}.`) : '';
  const tone = pos === 'noun' ? (gender === 'f' ? 'text-fem' : gender === 'm' ? 'text-masc' : 'text-muted') : 'text-muted';
  return <span className={cx('fr-meta text-[15px] whitespace-nowrap', tone)}>{short[pos] ?? pos}{g}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-serif text-2xl leading-tight">{value}</div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-paper p-5 shadow-xl md:rounded-xl', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">{title}</h2>
          <button aria-label={tr('关闭')} className="text-2xl leading-none text-muted" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- toast ----
const ToastCtx = createContext<(msg: string, tone?: 'good' | 'bad') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: 'good' | 'bad' }[]>([]);
  const push = useCallback((msg: string, tone: 'good' | 'bad' = 'good') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 md:bottom-6">
        {items.map((i) => (
          <div key={i.id} role="status" className={cx('rounded-md px-4 py-2 text-sm text-white shadow', i.tone === 'good' ? 'bg-ink' : 'bg-bad')}>{i.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Progress({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'good' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-line">
      <div className={cx('h-full', tone === 'accent' ? 'bg-accent' : 'bg-good')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export { cx };
