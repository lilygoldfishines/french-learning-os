import type { ReactNode } from 'react';
import { Button } from '../ui/kit';
import { tr } from '../i18n';

/** A labelled block on a reading page; renders nothing when empty. */
export function ReadSection({ title, children, show = true }: { title: string; children: ReactNode; show?: boolean }) {
  if (!show) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </section>
  );
}

/** Bottom bar of a reading page: optional extras on the left, Edit on the right. */
export function ReadFooter({ onEdit, children }: { onEdit?: () => void; children?: ReactNode }) {
  if (!onEdit) return null; // used inside the learning card: no edit bar there
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
      <div className="flex flex-wrap gap-2">{children}</div>
      <Button kind="primary" onClick={onEdit}>{tr('编辑')}</Button>
    </div>
  );
}

/** Multi-line text as typed (keeps line breaks). */
export const Para = ({ children, fr, className = '' }: { children: ReactNode; fr?: boolean; className?: string }) => (
  <p className={`whitespace-pre-wrap ${fr ? 'fr' : 'text-sm'} ${className}`} lang={fr ? 'fr' : undefined}>{children}</p>
);
