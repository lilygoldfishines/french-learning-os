import { useState } from 'react';
import { buildPreview, commit, KIND_LABEL, type Action, type CommitReport, type PreviewRow } from '../io/aiImport';
import { Badge, Button, cx } from '../ui/kit';
import { tr, trf } from '../i18n';
import { displayLemma } from '../db/rules';

const STATUS: Record<PreviewRow['status'], { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'accent' }> = {
  new: { label: tr('新增'), tone: 'good' },
  'possible-dup': { label: tr('可能重复'), tone: 'warn' },
  duplicate: { label: tr('已存在'), tone: 'neutral' },
  'similar-error': { label: tr('同类错误'), tone: 'accent' },
  invalid: { label: tr('格式错误'), tone: 'bad' },
};

function label(r: PreviewRow): string {
  const d = (r.data ?? r.raw) as Record<string, unknown> | undefined;
  if (!d) return '';
  if (r.kind === 'vocab') return displayLemma({ lemma: String(d.lemma ?? ''), article: d.article ? String(d.article) : undefined });
  if (r.kind === 'expression') return String(d.text ?? '');
  if (r.kind === 'sentence') return String(d.fr ?? '');
  if (r.kind === 'grammar') return String(d.name ?? '');
  return `${d.original ?? ''} → ${d.corrected ?? ''}`;
}
function sub(r: PreviewRow): string {
  const d = r.data as Record<string, unknown> | undefined;
  if (!d) return '';
  const ex = Array.isArray(d.examples) ? (d.examples as { fr: string }[]) : Array.isArray(d.correctExamples) ? (d.correctExamples as string[]).map((fr) => ({ fr })) : [];
  const exText = ex.length ? `« ${ex[0].fr} »${ex.length > 1 ? trf(' 等 {0} 个例句', ex.length) : ''}` : '';
  return [d.defEn, d.defZh, d.en, d.zh, d.explanation, exText].filter(Boolean).join(' · ');
}

function actionsFor(r: PreviewRow): { a: Action; label: string }[] {
  if (r.status === 'invalid' || r.status === 'duplicate') return [{ a: 'skip', label: tr('跳过') }];
  if (r.status === 'possible-dup') return [{ a: 'skip', label: tr('跳过') }, { a: 'add-anyway', label: tr('作为新词条') }];
  if (r.status === 'similar-error') return [{ a: 'merge', label: tr('合并（次数+1）') }, { a: 'add', label: tr('新建') }, { a: 'skip', label: tr('跳过') }];
  return [{ a: 'add', label: tr('导入') }, { a: 'skip', label: tr('跳过') }];
}

export default function ImportPreview({ rows: initial, onDone }: { rows: PreviewRow[]; onDone: (r: CommitReport) => void }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const setAction = (key: number, a: Action) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, action: a } : r)));
  // A noun that only failed for lack of gender can be fixed right here, then re-checked.
  const setGender = async (r: PreviewRow, gender: 'm' | 'f') => {
    const raw = { ...(r.raw as Record<string, unknown>), gender, pos: 'noun' };
    const [fixed] = await buildPreview([{ kind: 'vocab', raw }]);
    setRows((rs) => rs.map((x) => (x.key === r.key ? { ...fixed, key: r.key } : x)));
  };
  const needsGender = (r: PreviewRow) => r.kind === 'vocab' && r.status === 'invalid' && r.issues.includes(tr('名词必须标注阴阳性'));
  const counts = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
  const toWrite = rows.filter((r) => r.action !== 'skip').length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {Object.entries(counts).map(([k, v]) => <Badge key={k} tone={STATUS[k as PreviewRow['status']].tone}>{STATUS[k as PreviewRow['status']].label} {v}</Badge>)}
      </div>
      <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-md border border-line bg-panel">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge>{KIND_LABEL[r.kind]}</Badge>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                <span className="fr truncate">{label(r)}</span>
              </div>
              {sub(r) && <div className="mt-0.5 truncate text-xs text-muted">{sub(r)}</div>}
              {r.existingLabel && <div className="mt-0.5 text-xs text-muted">{tr('已有：')}<span className="fr">{r.existingLabel}</span></div>}
              {r.issues.map((i) => <div key={i} className="mt-0.5 text-xs text-bad">{i}</div>)}
            </div>
            {needsGender(r) && (
              <div className="flex shrink-0 items-center gap-1" role="group" aria-label={tr('选择阴阳性')}>
                <span className="text-xs text-muted">{tr('阴阳性：')}</span>
                <button onClick={() => setGender(r, 'm')} className="rounded border border-line px-2 py-1 text-xs">{tr('阳性 m.')}</button>
                <button onClick={() => setGender(r, 'f')} className="rounded border border-line px-2 py-1 text-xs">{tr('阴性 f.')}</button>
              </div>
            )}
            <div className="flex shrink-0 gap-1" role="group" aria-label={tr('处理方式')}>
              {actionsFor(r).map((o) => (
                <button key={o.a} onClick={() => setAction(r.key, o.a)} aria-pressed={r.action === o.a}
                  className={cx('rounded border px-2 py-1 text-xs', r.action === o.a ? 'border-ink bg-ink text-paper' : 'border-line')}>{o.label}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted">{tr('将写入')} {toWrite} {tr('条。不会修改任何已有记录。')}</span>
        <Button kind="primary" disabled={busy || toWrite === 0} onClick={async () => { setBusy(true); const rep = await commit(rows); setBusy(false); onDone(rep); }}>
          {tr('确认导入')}
        </Button>
      </div>
    </div>
  );
}
