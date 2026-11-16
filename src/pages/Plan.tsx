import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, db, insert, remove, update } from '../db/db';
import { saveSettings, useSettings } from '../db/bootstrap';
import { addDays, localDate, weekStart } from '../db/rules';
import { ACTIVITY_LABEL, ACTIVITY_TYPES, SKILLS, SKILL_LABEL, type ActivityType, type Goal, type GoalScope, type Retro, type Session, type Skill, type TimeBlock } from '../db/types';
import { Badge, Button, Field, Input, Modal, PageHeader, Section, Select, Textarea, cx, useToast } from '../ui/kit';
import { tr, trf } from '../i18n';

const DAYS = [tr('周一'), tr('周二'), tr('周三'), tr('周四'), tr('周五'), tr('周六'), tr('周日')];
const actOpts = ACTIVITY_TYPES.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }));
const skillOpts = [{ value: 'mixed', label: tr('综合') }, ...SKILLS.map((s) => ({ value: s, label: SKILL_LABEL[s] }))];

function Goals({ scope, period, title }: { scope: GoalScope; period: string; title: string }) {
  const goals = useLiveQuery(async () => (await all<Goal>('goal')).filter((g) => g.scope === scope && (scope === 'long' || g.period === period)), [scope, period]);
  const [text, setText] = useState('');
  return (
    <Section title={title}>
      <ul className="space-y-1">
        {goals?.map((g) => (
          <li key={g.id} className="group flex items-center gap-2">
            <input type="checkbox" checked={g.done} onChange={(e) => update<Goal>('goal', g.id, { done: e.target.checked })} aria-label={g.title} />
            <span className={cx('flex-1 text-sm', g.done && 'text-faint line-through')}>{g.title}</span>
            <button className="text-xs text-faint opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => remove('goal', g.id)} aria-label={tr('删除目标')}>{tr('删除')}</button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await insert('goal', { scope, period, title: text.trim(), skillFocus: [], done: false }); setText(''); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('添加目标')} aria-label={trf('添加{0}', title)} />
        <Button type="submit">{tr('添加')}</Button>
      </form>
    </Section>
  );
}

function RetroBox({ scope, period }: { scope: 'week' | 'month'; period: string }) {
  const toast = useToast();
  const existing = useLiveQuery(() => db.retro.where('[scope+period]').equals([scope, period]).filter((r) => !r.deletedAt).first(), [scope, period]);
  const [r, setR] = useState({ wentWell: '', problems: '', adjustNext: '' });
  useEffect(() => { setR({ wentWell: existing?.wentWell ?? '', problems: existing?.problems ?? '', adjustNext: existing?.adjustNext ?? '' }); }, [existing?.id, existing?.updatedAt]);
  return (
    <Section title={scope === 'week' ? tr('本周复盘') : tr('本月复盘')}>
      <div className="space-y-2">
        <Field label={tr('做得好的')}><Textarea rows={2} value={r.wentWell} onChange={(e) => setR({ ...r, wentWell: e.target.value })} /></Field>
        <Field label={tr('遇到的问题')}><Textarea rows={2} value={r.problems} onChange={(e) => setR({ ...r, problems: e.target.value })} /></Field>
        <Field label={tr('下一步调整')}><Textarea rows={2} value={r.adjustNext} onChange={(e) => setR({ ...r, adjustNext: e.target.value })} /></Field>
        <Button onClick={async () => {
          if (existing) await update<Retro>('retro', existing.id, r);
          else await insert('retro', { scope, period, ...r });
          toast(tr('复盘已保存'));
        }}>{tr('保存复盘')}</Button>
      </div>
    </Section>
  );
}

function SessionForm({ initial, onClose }: { initial: Partial<Session>; onClose: () => void }) {
  const [s, setS] = useState({
    date: initial.startedAt ? localDate(new Date(initial.startedAt)) : localDate(new Date()),
    minutes: initial.minutes ?? 30, activityType: initial.activityType ?? ('active' as ActivityType),
    skill: initial.skill ?? ('mixed' as Skill | 'mixed'), notes: initial.notes ?? '', outcome: initial.outcome ?? '',
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('日期')}><Input type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} /></Field>
        <Field label={tr('分钟')}><Input type="number" min={1} value={s.minutes} onChange={(e) => setS({ ...s, minutes: Number(e.target.value) })} /></Field>
        <Field label={tr('活动类型')}><Select value={s.activityType} onChange={(e) => setS({ ...s, activityType: e.target.value as ActivityType })} options={actOpts} /></Field>
        <Field label={tr('能力')}><Select value={s.skill} onChange={(e) => setS({ ...s, skill: e.target.value as Skill | 'mixed' })} options={skillOpts} /></Field>
      </div>
      <Field label={tr('学了什么')}><Textarea rows={2} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} /></Field>
      <Field label={tr('结果 / 收获')}><Textarea rows={2} value={s.outcome} onChange={(e) => setS({ ...s, outcome: e.target.value })} /></Field>
      <div className="flex justify-between">
        <div>{initial.id && <Button kind="danger" onClick={async () => { await remove('session', initial.id!); onClose(); }}>{tr('删除')}</Button>}</div>
        <div className="flex gap-2"><Button onClick={onClose}>{tr('取消')}</Button><Button kind="primary" disabled={!(s.minutes > 0)} onClick={async () => {
          const startedAt = new Date(`${s.date}T12:00:00`).toISOString();
          const keepTime = initial.startedAt && localDate(new Date(initial.startedAt)) === s.date ? initial.startedAt : startedAt;
          const data = { startedAt: keepTime, minutes: s.minutes, activityType: s.activityType, skill: s.skill, notes: s.notes, outcome: s.outcome };
          if (initial.id) await update<Session>('session', initial.id, data); else await insert('session', data);
          onClose();
        }}>{tr('保存')}</Button></div>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const settings = useSettings();
  const [ws, setWs] = useState(weekStart());
  const [blockDay, setBlockDay] = useState<number | null>(null);
  const [block, setBlock] = useState({ minutes: 60, activityType: 'active' as ActivityType, skill: 'mixed' as Skill | 'mixed', note: '' });
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const data = useLiveQuery(async () => {
    const blocks = (await all<TimeBlock>('timeBlock')).filter((b) => b.weekStart === ws);
    const end = addDays(ws, 7);
    const sessions = (await all<Session>('session')).filter((s) => { const d = localDate(new Date(s.startedAt)); return d >= ws && d < end; });
    return { blocks, sessions };
  }, [ws]);
  const month = ws.slice(0, 7);
  const planned = data?.blocks.reduce((a, b) => a + b.plannedMinutes, 0) ?? 0;
  const actual = data?.sessions.reduce((a, b) => a + b.minutes, 0) ?? 0;

  return (
    <div>
      <PageHeader title={tr('学习计划')} sub={tr('以周为单位安排；某天没学不算失败，看整周')} actions={
        <div className="flex items-center gap-1">
          <Button onClick={() => setWs(addDays(ws, -7))} aria-label={tr('上一周')}>‹</Button>
          <span className="px-2 text-sm">{ws} {tr('周')}</span>
          <Button onClick={() => setWs(addDays(ws, 7))} aria-label={tr('下一周')}>›</Button>
          {ws !== weekStart() && <Button onClick={() => setWs(weekStart())}>{tr('本周')}</Button>}
        </div>
      } />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Goals scope="long" period="" title={tr('长期目标')} />
        <Goals scope="month" period={month} title={trf('月度目标 · {0}', month)} />
        <Goals scope="week" period={ws} title={tr('本周目标')} />
      </div>

      <Section title={tr('时间块 · 计划与实际')} aside={
        <label className="flex items-center gap-2 text-xs text-muted">{tr('每周目标（小时）')}
          <Input type="number" min={0} step={0.5} className="w-20 py-0.5" value={settings.weeklyTargetMinutes / 60}
            onChange={(e) => saveSettings({ weeklyTargetMinutes: Math.round(Number(e.target.value) * 60) })} />
        </label>
      }>
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <span>{tr('目标')} <b>{(settings.weeklyTargetMinutes / 60).toFixed(1)}</b> {tr('小时')}</span>
          <span>{tr('已计划')} <b>{(planned / 60).toFixed(1)}</b> {tr('小时')}</span>
          <span>{tr('实际')} <b>{(actual / 60).toFixed(1)}</b> {tr('小时')}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {DAYS.map((d, i) => {
            const date = addDays(ws, i);
            const blocks = data?.blocks.filter((b) => b.day === i) ?? [];
            const sess = data?.sessions.filter((s) => localDate(new Date(s.startedAt)) === date) ?? [];
            const isToday = date === localDate(new Date());
            return (
              <div key={d} className={cx('rounded-md border p-2', isToday ? 'border-accent' : 'border-line')}>
                <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{d}</span><span className="text-faint">{date.slice(5)}</span></div>
                {blocks.map((b) => (
                  <div key={b.id} className="group mb-1 rounded bg-accent-soft px-1.5 py-1 text-xs">
                    <div className="flex justify-between"><span>{ACTIVITY_LABEL[b.activityType]}</span><button className="text-faint" onClick={() => remove('timeBlock', b.id)} aria-label={tr('删除时间块')}>×</button></div>
                    <div className="text-muted">{b.plannedMinutes} {tr('分钟')}{b.note ? ` · ${b.note}` : ''}</div>
                  </div>
                ))}
                {sess.map((s) => (
                  <button key={s.id} onClick={() => setSession(s)} className="mb-1 block w-full rounded border border-good/30 px-1.5 py-1 text-left text-xs">
                    <span className="text-good">✓ {s.minutes} {tr('分钟')}</span> <span className="text-muted">{ACTIVITY_LABEL[s.activityType]}</span>
                  </button>
                ))}
                <button className="mt-1 w-full text-left text-xs text-accent" onClick={() => setBlockDay(i)}>{tr('＋ 时间块')}</button>
              </div>
            );
          })}
        </div>
        <div className="mt-3"><Button onClick={() => setSession({})}>{tr('＋ 补记一次学习')}</Button></div>
      </Section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <RetroBox scope="week" period={ws} />
        <RetroBox scope="month" period={month} />
      </div>

      <Modal open={blockDay !== null} onClose={() => setBlockDay(null)} title={trf('{0} · 新时间块', blockDay !== null ? DAYS[blockDay] : '')}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr('分钟')}><Input type="number" min={5} step={5} value={block.minutes} onChange={(e) => setBlock({ ...block, minutes: Number(e.target.value) })} /></Field>
            <Field label={tr('活动类型')}><Select value={block.activityType} onChange={(e) => setBlock({ ...block, activityType: e.target.value as ActivityType })} options={actOpts} /></Field>
            <Field label={tr('能力')}><Select value={block.skill} onChange={(e) => setBlock({ ...block, skill: e.target.value as Skill | 'mixed' })} options={skillOpts} /></Field>
            <Field label={tr('备注')}><Input value={block.note} onChange={(e) => setBlock({ ...block, note: e.target.value })} placeholder={tr('如：读 Le Monde 影评')} /></Field>
          </div>
          <Button kind="primary" className="w-full" onClick={async () => {
            await insert('timeBlock', { weekStart: ws, day: blockDay!, plannedMinutes: block.minutes, activityType: block.activityType, skill: block.skill, note: block.note });
            setBlockDay(null);
          }}>{tr('添加')}</Button>
        </div>
      </Modal>
      <Modal open={!!session} onClose={() => setSession(null)} title={session?.id ? tr('学习记录') : tr('补记学习')}>
        {session && <SessionForm initial={session} onClose={() => setSession(null)} />}
      </Modal>
      <p className="mt-6 text-xs text-faint">{tr('活动分类：')}{ACTIVITY_TYPES.map((a) => ACTIVITY_LABEL[a]).join(' · ')}{tr('。')}<Badge>{tr('计划')}</Badge> {tr('是时间块，')}<Badge tone="good">{tr('实际')}</Badge> {tr('是学习记录。')}</p>
    </div>
  );
}
