import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, insert, remove } from '../db/db';
import { DESCRIPTORS } from '../data/seed';
import { localDate } from '../db/rules';
import { CEFR_LEVELS, EVIDENCE_LABEL, EVIDENCE_TYPES, SKILLS, SKILL_LABEL, type Assessment, type Cefr, type Skill } from '../db/types';
import { fmtLevel, latestBySkill } from '../features/stats';
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Section, Select, Textarea, cx, useToast } from '../ui/kit';

function AddForm({ onClose, skill: initialSkill }: { onClose: () => void; skill: Skill }) {
  const toast = useToast();
  const [a, setA] = useState({ date: localDate(new Date()), skill: initialSkill, level: 'B1' as Cefr, modifier: '' as '' | '-' | '+', evidenceType: 'writing-sample', evidenceRef: '', notes: '', descriptorsMet: [] as string[] });
  const desc = DESCRIPTORS[a.level][a.skill];
  const toggle = (d: string) => setA((x) => ({ ...x, descriptorsMet: x.descriptorsMet.includes(d) ? x.descriptorsMet.filter((y) => y !== d) : [...x.descriptorsMet, d] }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="日期"><Input type="date" value={a.date} onChange={(e) => setA({ ...a, date: e.target.value })} /></Field>
        <Field label="能力"><Select value={a.skill} onChange={(e) => setA({ ...a, skill: e.target.value as Skill, descriptorsMet: [] })} options={SKILLS.map((s) => ({ value: s, label: SKILL_LABEL[s] }))} /></Field>
        <Field label="等级"><Select value={a.level} onChange={(e) => setA({ ...a, level: e.target.value as Cefr, descriptorsMet: [] })} options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))} /></Field>
        <Field label="细分"><Select value={a.modifier} onChange={(e) => setA({ ...a, modifier: e.target.value as '' | '-' | '+' })} options={[{ value: '-', label: '偏低 −' }, { value: '', label: '稳定' }, { value: '+', label: '偏高 +' }]} /></Field>
      </div>
      <Field label="证据类型"><Select value={a.evidenceType} onChange={(e) => setA({ ...a, evidenceType: e.target.value })} options={EVIDENCE_TYPES.map((t) => ({ value: t, label: EVIDENCE_LABEL[t] }))} /></Field>
      {a.evidenceType === 'self' && <p className="text-xs text-warn">自我评估证据较弱，建议尽快用写作样本、录音或模考来验证。</p>}
      <Field label="证据" hint="作文全文、录音链接、模考分数、老师评语等。这是这条评估的依据。">
        <Textarea rows={4} value={a.evidenceRef} onChange={(e) => setA({ ...a, evidenceRef: e.target.value })} />
      </Field>
      <Field label={`${a.level} ${SKILL_LABEL[a.skill]}：已经能做到的`}>
        <div className="space-y-1">
          {desc.map((d) => (
            <label key={d} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={a.descriptorsMet.includes(d)} onChange={() => toggle(d)} />{d}</label>
          ))}
        </div>
      </Field>
      <Field label="备注"><Textarea rows={2} value={a.notes} onChange={(e) => setA({ ...a, notes: e.target.value })} /></Field>
      <Button kind="primary" className="w-full" disabled={!a.evidenceRef.trim()} onClick={async () => {
        await insert('assessment', a);
        toast('评估已记录');
        onClose();
      }}>保存评估</Button>
      {!a.evidenceRef.trim() && <p className="text-center text-xs text-faint">必须填写证据才能保存</p>}
    </div>
  );
}

export default function AssessPage() {
  const list = useLiveQuery(() => all<Assessment>('assessment'), []);
  const [adding, setAdding] = useState<Skill | null>(null);
  const [view, setView] = useState<Assessment | null>(null);
  const [frameLevel, setFrameLevel] = useState<Cefr>('B2');
  const latest = latestBySkill(list ?? []);
  return (
    <div>
      <PageHeader title="能力评估" sub="四项能力分别评估；每条评估都要附上可观察的证据" actions={<Button kind="primary" onClick={() => setAdding('writing')}>＋ 记录评估</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {SKILLS.map((s) => {
          const hist = (list ?? []).filter((a) => a.skill === s).sort((a, b) => b.date.localeCompare(a.date));
          return (
            <Section key={s} title={SKILL_LABEL[s]} aside={<button className="text-xs text-accent" onClick={() => setAdding(s)}>＋ 评估</button>}>
              <div className="font-serif text-3xl">{latest[s] ? fmtLevel(latest[s]!) : <span className="text-base text-faint">未评估</span>}</div>
              {hist.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {hist.slice(0, 5).map((a) => (
                    <li key={a.id}><button className="flex w-full justify-between text-left hover:text-accent" onClick={() => setView(a)}>
                      <span>{a.date} · {fmtLevel(a)}</span><span className="text-xs text-muted">{EVIDENCE_LABEL[a.evidenceType]}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </Section>
          );
        })}
      </div>

      <Section title="CEFR 能力框架" className="mt-6" aside={
        <div className="flex gap-1">{CEFR_LEVELS.map((l) => <button key={l} onClick={() => setFrameLevel(l)} className={cx('rounded px-2 py-0.5 text-xs', frameLevel === l ? 'bg-ink text-paper' : 'text-muted')}>{l}</button>)}</div>
      }>
        <div className="grid gap-4 md:grid-cols-2">
          {SKILLS.map((s) => (
            <div key={s}>
              <div className="mb-1 text-sm font-medium">{SKILL_LABEL[s]}</div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">{DESCRIPTORS[frameLevel][s].map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">这是本应用对 CEFR 等级的简明概括，用来辅助自查，不是欧洲委员会的官方原文。</p>
      </Section>

      {list?.length === 0 && <div className="mt-6"><Empty>建议第一步：写一篇约 250 词的短文、录一段 3 分钟的观点陈述，在 Claude 中对照 CEFR 评分后记录在这里。</Empty></div>}

      <Modal open={!!adding} onClose={() => setAdding(null)} title="记录评估" wide>{adding && <AddForm skill={adding} onClose={() => setAdding(null)} />}</Modal>
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${SKILL_LABEL[view.skill]} · ${fmtLevel(view)} · ${view.date}` : ''}>
        {view && (
          <div className="space-y-3 text-sm">
            <Badge>{EVIDENCE_LABEL[view.evidenceType]}</Badge>
            <div className="rounded-md border border-line bg-panel p-3 whitespace-pre-wrap">{view.evidenceRef}</div>
            {view.descriptorsMet.length > 0 && <ul className="list-disc pl-5">{view.descriptorsMet.map((d) => <li key={d}>{d}</li>)}</ul>}
            {view.notes && <p className="text-muted">{view.notes}</p>}
            <Button kind="danger" onClick={async () => { if (confirm('删除这条评估？')) { await remove('assessment', view.id); setView(null); } }}>删除</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
