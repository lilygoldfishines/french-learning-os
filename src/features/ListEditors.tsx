import type { Example } from '../db/types';
import { Button, Input } from '../ui/kit';

export function ExamplesEditor({ value, onChange }: { value: Example[]; onChange: (v: Example[]) => void }) {
  const set = (i: number, patch: Partial<Example>) => onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      {value.map((e, i) => (
        <div key={i} className="space-y-1 rounded-md border border-line p-2">
          <Input lang="fr" className="fr" placeholder="法语例句" value={e.fr} onChange={(x) => set(i, { fr: x.target.value })} />
          <div className="grid gap-1 md:grid-cols-2">
            <Input placeholder="English" value={e.en ?? ''} onChange={(x) => set(i, { en: x.target.value })} />
            <Input placeholder="中文" value={e.zh ?? ''} onChange={(x) => set(i, { zh: x.target.value })} />
          </div>
          <button type="button" className="text-xs text-bad" onClick={() => onChange(value.filter((_, j) => j !== i))}>删除例句</button>
        </div>
      ))}
      <Button type="button" onClick={() => onChange([...value, { fr: '', en: '', zh: '' }])}>＋ 例句</Button>
    </div>
  );
}

export function LinesEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <textarea
      rows={Math.max(2, value.length + 1)}
      lang="fr"
      className="fr w-full rounded-md border border-line bg-panel px-2.5 py-1.5 outline-none focus:border-accent"
      placeholder={placeholder ?? '每行一句'}
      value={value.join('\n')}
      onChange={(e) => onChange(e.target.value.split('\n'))}
      onBlur={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
    />
  );
}
