import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, db } from '../db/db';
import { useSettings } from '../db/bootstrap';
import { buildQueue } from '../srs';
import { ACTIVITY_LABEL, CEFR_LEVELS, ERROR_TYPE_LABEL, LEARN_STATUS, LEARN_STATUS_LABEL, SKILLS, SKILL_LABEL, type Assessment, type ErrorEntry, type Goal, type Grammar, type Session, type TimeBlock, type Vocab } from '../db/types';
import { fmtLevel, latestBySkill, levelIndex, suggestions, weekMinutes, weeklyHistory } from '../features/stats';
import { Badge, Button, Empty, PageHeader, Progress, Section, Stat } from '../ui/kit';
import { weekStart } from '../db/rules';

const h = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)} 小时` : `${m} 分钟`);

function AbilityGrid({ latest, target }: { latest: Partial<Record<string, Assessment>>; target: string }) {
  const t = CEFR_LEVELS.indexOf(target as never);
  return (
    <div className="space-y-3">
      {SKILLS.map((s) => {
        const a = latest[s];
        const idx = a ? levelIndex(a) : -1;
        return (
          <div key={s} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-3">
            <span className="text-sm">{SKILL_LABEL[s]}</span>
            <div className="relative grid grid-cols-6 gap-px" aria-label={`${SKILL_LABEL[s]} ${a ? fmtLevel(a) : '未评估'}`}>
              {CEFR_LEVELS.map((l, i) => (
                <div key={l} className={`h-5 ${i <= Math.floor(idx) ? 'bg-accent' : 'bg-line'} ${i === t ? 'outline outline-1 outline-ink' : ''}`} title={l} />
              ))}
            </div>
            <span className="text-right font-serif">{a ? fmtLevel(a) : <span className="text-xs text-faint">未评估</span>}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[3rem_1fr_3.5rem] gap-3 text-[10px] text-faint">
        <span />
        <div className="grid grid-cols-6">{CEFR_LEVELS.map((l) => <span key={l} className="text-center">{l}</span>)}</div>
        <span />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const [assess, errors, vocab, grammar, sessions, blocks, goals] = await Promise.all([
      all<Assessment>('assessment'), all<ErrorEntry>('error'), all<Vocab>('vocab'), all<Grammar>('grammar'),
      all<Session>('session'), all<TimeBlock>('timeBlock'), all<Goal>('goal'),
    ]);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const logs = await db.reviewLog.where('reviewedAt').above(since).toArray();
    const matureLogs = logs.filter((l) => l.stateBefore === 2);
    return { assess, errors, vocab, grammar, sessions, blocks, goals, logs, matureLogs };
  }, []);
  const queue = useLiveQuery(() => buildQueue(settings), [settings.dailyNewLimit, settings.dailyReviewLimit, settings.retention]);
  if (!data) return null;

  const latest = latestBySkill(data.assess);
  const week = weekMinutes(data.sessions, data.blocks);
  const hist = weeklyHistory(data.sessions, 8);
  const maxHist = Math.max(60, ...hist.map((x) => x.minutes));
  const ws = weekStart();
  const month = ws.slice(0, 7);
  const weekGoals = data.goals.filter((g) => g.scope === 'week' && g.period === ws);
  const monthGoals = data.goals.filter((g) => g.scope === 'month' && g.period === month);
  const longGoals = data.goals.filter((g) => g.scope === 'long');
  const retention = data.matureLogs.length ? Math.round((data.matureLogs.filter((l) => l.rating > 1).length / data.matureLogs.length) * 100) : null;
  const vocabByStatus = Object.fromEntries(LEARN_STATUS.map((s) => [s, data.vocab.filter((v) => v.status === s).length]));
  const grammarDone = data.grammar.filter((g) => g.skipped || g.mastery >= 3).length;
  const openErrors = data.errors.filter((e) => e.status !== 'verified');
  const topErrors = [...openErrors].sort((a, b) => b.occurrences.length - a.occurrences.length).slice(0, 5);
  const sugg = suggestions(latest, data.errors, settings.targetLevel);
  const recent = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5);
  const dueCount = (queue?.due.length ?? 0) + (queue?.fresh.length ?? 0);

  return (
    <div>
      <PageHeader
        title="控制台"
        eyebrow={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        sub={`目标：${settings.targetLevel}，${settings.targetDate} 前 · 本周从 ${ws} 开始`}
        actions={<Link to="/review"><Button kind="primary">复习 {dueCount > 0 ? `· ${dueCount}` : ''}</Button></Link>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {/* LAYER 3: proven ability */}
        <Section title="能力 · 经评估证明" className="md:col-span-2" aside={<Link to="/assess" className="text-xs text-accent">记录评估</Link>}>
          <AbilityGrid latest={latest} target={settings.targetLevel} />
          <p className="mt-3 text-xs text-faint">等级只来自带证据的评估记录，和学习时长、复习数量无关。黑框 = 目标等级。</p>
        </Section>

        <Section title="今天的复习">
          {queue ? (
            <div className="space-y-2">
              <Stat label="待复习" value={queue.due.length} sub={queue.overdueDeferred ? `另有 ${queue.overdueDeferred} 张顺延到之后几天` : undefined} />
              <Stat label="可学新卡" value={queue.fresh.length} sub={`今天已复习 ${queue.reviewedToday} 次`} />
            </div>
          ) : null}
        </Section>

        {/* LAYER 1 + 2: plan vs actual activity */}
        <Section title="本周 · 计划与实际活动" className="md:col-span-2" aside={<Link to="/plan" className="text-xs text-accent">调整计划</Link>}>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="目标" value={h(settings.weeklyTargetMinutes)} />
            <Stat label="已排时间块" value={h(week.planned)} />
            <Stat label="实际学习" value={h(week.actual)} />
          </div>
          <div className="mt-3"><Progress value={week.actual} max={settings.weeklyTargetMinutes} /></div>
          {Object.keys(week.byActivity).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(week.byActivity).map(([k, v]) => <Badge key={k}>{ACTIVITY_LABEL[k as keyof typeof ACTIVITY_LABEL]} {h(v)}</Badge>)}
            </div>
          )}
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted">近 8 周学习时间</div>
            <div className="flex h-16 items-end gap-1">
              {hist.map((w) => (
                <div key={w.ws} className="flex-1" title={`${w.ws}：${h(w.minutes)}`}>
                  <div className={`${w.ws === ws ? 'bg-accent' : 'bg-faint/60'}`} style={{ height: `${(w.minutes / maxHist) * 64}px` }} />
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="目标">
          {[['长期', longGoals], [`本月 ${month}`, monthGoals], ['本周', weekGoals]].map(([label, list]) => (
            <div key={label as string} className="mb-2">
              <div className="text-xs text-muted">{label as string}</div>
              {(list as Goal[]).length ? (list as Goal[]).map((g) => <div key={g.id} className={`text-sm ${g.done ? 'text-faint line-through' : ''}`}>{g.title}</div>) : <div className="text-sm text-faint">—</div>}
            </div>
          ))}
        </Section>

        <Section title="下一步重点">
          {sugg.length ? (
            <ul className="space-y-2 text-sm">{sugg.slice(0, 5).map((s) => <li key={s.text}><div>{s.text}</div><div className="text-xs text-muted">{s.why}</div></li>)}</ul>
          ) : <p className="text-sm text-muted">暂无建议。</p>}
        </Section>

        <Section title="高频错误" aside={<Link to="/errors" className="text-xs text-accent">错误库</Link>}>
          {topErrors.length ? (
            <ul className="space-y-2 text-sm">
              {topErrors.map((e) => (
                <li key={e.id}>
                  <div className="fr"><s className="text-bad/80">{e.original}</s> → {e.corrected}</div>
                  <div className="text-xs text-muted">{ERROR_TYPE_LABEL[e.errorType]} · {e.occurrences.length} 次</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">还没有未解决的错误。</p>}
        </Section>

        <Section title="知识积累">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="词汇" value={data.vocab.length} sub={LEARN_STATUS.map((s) => `${LEARN_STATUS_LABEL[s]} ${vocabByStatus[s]}`).join(' · ')} />
            <Stat label="记忆保留率（30 天）" value={retention === null ? '—' : `${retention}%`} sub={`${data.matureLogs.length} 次成熟卡复习`} />
            <Stat label="语法" value={`${grammarDone} / ${data.grammar.length}`} sub="掌握或跳过" />
            <Stat label="错误" value={`${openErrors.length} 未解决`} sub={`${data.errors.length - openErrors.length} 已验证`} />
          </div>
        </Section>

        <Section title="最近学习记录" className="md:col-span-2">
          {recent.length ? (
            <ul className="divide-y divide-line text-sm">
              {recent.map((s) => (
                <li key={s.id} className="flex justify-between py-1.5">
                  <span>{ACTIVITY_LABEL[s.activityType]}{s.notes ? ` · ${s.notes}` : ''}</span>
                  <span className="text-muted">{new Date(s.startedAt).toLocaleDateString('zh-CN')} · {s.minutes} 分钟</span>
                </li>
              ))}
            </ul>
          ) : <Empty>还没有学习记录。点「＋ 快速记录 → 计时」开始。</Empty>}
        </Section>
      </div>
    </div>
  );
}
