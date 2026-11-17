import { useState, type ReactNode } from 'react';
import ImportPreview from './ImportPreview';
import { buildPreview, type Kind, type PreviewRow } from '../io/aiImport';
import { Button, Textarea, useToast } from '../ui/kit';
import { tr, trf } from '../i18n';

/** One item per line → the same preview/dedupe screen the JSON import uses. */
export default function BatchAdd({ kind, parse, help, placeholder, extra, onClose }: {
  kind: Kind;
  parse: (line: string) => unknown;
  help: ReactNode;
  placeholder: string;
  extra?: ReactNode;
  onClose: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const preview = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    setRows(await buildPreview(lines.map((l) => ({ kind, raw: parse(l) }))));
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
