import { useState, type ReactNode } from 'react';
import ImportPreview from './ImportPreview';
import { buildPreview, type Kind, type PreviewRow } from '../io/aiImport';
import { Button, Textarea, useToast } from '../ui/kit';
import { tr, trf } from '../i18n';
import { exampleFromLine, isExampleLine } from '../db/rules';
import type { Example } from '../db/types';

/** One item per line → the same preview/dedupe screen the JSON import uses. */
export default function BatchAdd({ kind, parse, addExample, help, placeholder, extra, onClose }: {
  kind: Kind;
  parse: (line: string) => unknown;
  /** How an "- example" line is added to the entry above; without it such lines are read as entries. */
  addExample?: (raw: Record<string, unknown>, ex: Example) => Record<string, unknown>;
  help: ReactNode;
  placeholder: string;
  extra?: ReactNode;
  onClose: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const preview = async () => {
    const raws: Record<string, unknown>[] = [];
    for (const l of text.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const ex = addExample && raws.length && isExampleLine(l) ? exampleFromLine(l) : null;
      if (ex) raws[raws.length - 1] = addExample!(raws[raws.length - 1], ex);
      else raws.push(parse(l) as Record<string, unknown>);
    }
    setRows(await buildPreview(raws.map((raw) => ({ kind, raw }))));
  };
  if (rows) return <ImportPreview rows={rows} onDone={(r) => { toast(trf('导入 {0} 条，跳过 {1} 条', r.added, r.skipped)); onClose(); }} />;
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">{help}</div>
      <Textarea rows={8} lang="fr" className="fr" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={tr('批量内容')} />
      {extra}
      <Button kind="primary" onClick={preview} disabled={!text.trim()}>{tr('预览')}</Button>
    </div>
  );
}
