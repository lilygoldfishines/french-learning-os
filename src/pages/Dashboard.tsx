import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { all, db } from '../db/db';
import { useSettings } from '../db/bootstrap';
import { buildConjQueue, buildLearnQueue, buildQueue } from '../srs';
import { ACTIVITY_LABEL, CEFR_LEVELS, ERROR_TYPE_LABEL, LEARN_STATUS, LEARN_STATUS_LABEL, SKILLS, SKILL_LABEL, type Assessment, type ErrorEntry, type Goal, type Grammar, type Session, type TimeBlock, type Vocab } from '../db/types';
import { fmtLevel, latestBySkill, levelIndex, suggestions, weekMinutes, weeklyHistory } from '../features/stats';
import { Badge, Button, Empty, PageHeader, Progress, Section, Stat } from '../ui/kit';
import { weekStart } from '../db/rules';
import { tr, trf } from '../i18n';

const h = (m: number) => (m >= 60 ? trf('{0} 小时', (m / 60).toFixed(1)) : trf('{0} 分钟', m));

function AbilityGrid({ latest, target }: { latest: Partial<Record<string, Assessment>>; target: string }) {
  const t = CEFR_LEVELS.indexOf(target as never);
  return (
    <div className="space-y-3">
      {SKILLS.map((s) => {
        const a = latest[s];
        const idx = a ? levelIndex(a) : -1;
        return (
          <div key={s} className="grid grid-cols-[4.75rem_1fr_5.5rem] items-center gap-3">
            <span className="text-sm">{SKILL_LABEL[s]}</span>
            <div className="relative grid grid-cols-6 gap-px" aria-label={`${SKILL_LABEL[s]} ${a ? fmtLevel(a) : tr('未评估')}`}>
              {CEFR_LEVELS.map((l, i) => (
                <div key={l} className={`h-5 ${i <= Math.floor(idx) ? 'bg-accent' : 'bg-line'} ${i === t ? 'outline outline-1 outline-ink' : ''}`} title={l} />
              ))}
            </div>
            <span className="text-right font-serif whitespace-nowrap">{a ? fmtLevel(a) : <span className="text-xs text-faint">{tr('未评估')}</span>}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[4.75rem_1fr_5.5rem] gap-3 text-[10px] text-faint">
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
  const queue = useLiveQuery(() => buildQueue(settings), [settings]);
  const conj = useLiveQuery(() => buildConjQueue(settings), [settings]);
  const learnQ = useLiveQuery(() => buildLearnQueue(settings), [settings]);
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
  const dueCount = queue?.due.length ?? 0;
  const learnCount = learnQ?.entries.length ?? 0;

  return (
    <div>
      <PageHeader
        title={tr('控制台')}
        eyebrow={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        sub={trf('目标：{0}，{1} 前 · 本周从 {2} 开始', settings.targetLevel, settings.targetDate, ws)}
        actions={<>
          <Link to="/learn"><Button>{tr('学习')} {learnCount > 0 ? `· ${learnCount}` : ''}</Button></Link>
          <Link to="/review"><Button kind="primary">{tr('复习')} {dueCount > 0 ? `· ${dueCount}` : ''}</Button></Link>
        </>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {/* LAYER 3: proven ability */}
        <Section title={tr('能力 · 经评估证明')} className="md:col-span-2" aside={<Link to="/assess" className="text-xs text-accent">{tr('记录评估')}</Link>}>
          <AbilityGrid latest={latest} target={settings.targetLevel} />
          <p className="mt-3 text-xs text-faint">{tr('等级只来自带证据的评估记录，和学习时长、复习数量无关。黑框 = 目标等级。')}</p>
        </Section>

        <Section title={tr('今天的学习与复习')}>
          {queue ? (
            <div className="space-y-2">
              <Link to="/learn" className="block"><Stat label={tr('今天可学')} value={learnCount} sub={learnQ?.waiting ? trf('另有 {0} 个超出今天上限', learnQ.waiting) : trf('今天已学 {0} 个', queue.newToday)} /></Link>
              <Link to="/review" className="block"><Stat label={tr('待复习')} value={queue.due.length} sub={queue.overdueDeferred ? trf('另有 {0} 张顺延到之后几天', queue.overdueDeferred) : trf('今天已复习 {0} 次', queue.reviewedToday)} /></Link>
              {!!conj?.total && <Link to="/conjugation" className="block"><Stat label={tr('动词变位待练')} value={conj.due.length + conj.fresh.length} sub={tr('去练习 →')} /></Link>}
            </div>
          ) : null}
        </Section>

        {/* LAYER 1 + 2: plan vs actual activity */}
        <Section title={tr('本周 · 计划与实际活动')} className="md:col-span-2" aside={<Link to="/plan" className="text-xs text-accent">{tr('调整计划')}</Link>}>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={tr('目标')} value={h(settings.weeklyTargetMinutes)} />
            <Stat label={tr('已排时间块')} value={h(week.planned)} />
            <Stat label={tr('实际学习')} value={h(week.actual)} />
          </div>
          <div className="mt-3"><Progress value={week.actual} max={settings.weeklyTargetMinutes} /></div>
          {Object.keys(week.byActivity).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(week.byActivity).map(([k, v]) => <Badge key={k}>{ACTIVITY_LABEL[k as keyof typeof ACTIVITY_LABEL]} {h(v)}</Badge>)}
            </div>
          )}
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted">{tr('近 8 周学习时间')}</div>
            <div className="flex h-16 items-end gap-1">
              {hist.map((w) => (
                <div key={w.ws} className="flex-1" title={trf('{0}：{1}', w.ws, h(w.minutes))}>
                  <div className={`${w.ws === ws ? 'bg-accent' : 'bg-faint/60'}`} style={{ height: `${(w.minutes / maxHist) * 64}px` }} />
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title={tr('目标')}>
          {[[tr('长期'), longGoals], [trf('本月 {0}', month), monthGoals], [tr('本周'), weekGoals]].map(([label, list]) => (
            <div key={label as string} className="mb-2">
              <div className="text-xs text-muted">{label as string}</div>
              {(list as Goal[]).length ? (list as Goal[]).map((g) => <div key={g.id} className={`text-sm ${g.done ? 'text-faint line-through' : ''}`}>{g.title}</div>) : <div className="text-sm text-faint">—</div>}
            </div>
          ))}
        </Section>

        <Section title={tr('下一步重点')}>
          {sugg.length ? (
            <ul className="space-y-2 text-sm">{sugg.slice(0, 5).map((s) => <li key={s.text}><div>{s.text}</div><div className="text-xs text-muted">{s.why}</div></li>)}</ul>
          ) : <p className="text-sm text-muted">{tr('暂无建议。')}</p>}
        </Section>

        <Section title={tr('高频错误')} aside={<Link to="/errors" className="text-xs text-accent">{tr('错误库')}</Link>}>
          {topErrors.length ? (
            <ul className="space-y-2 text-sm">
              {topErrors.map((e) => (
                <li key={e.id}>
                  <div className="fr"><s className="text-bad/80">{e.original}</s> → {e.corrected}</div>
                  <div className="text-xs text-muted">{ERROR_TYPE_LABEL[e.errorType]} · {e.occurrences.length} {tr('次')}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{tr('还没有未解决的错误。')}</p>}
        </Section>

        <Section title={tr('知识积累')}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={tr('词汇')} value={data.vocab.length} sub={LEARN_STATUS.map((s) => `${LEARN_STATUS_LABEL[s]} ${vocabByStatus[s]}`).join(' · ')} />
            <Stat label={tr('记忆保留率（30 天）')} value={retention === null ? '—' : `${retention}%`} sub={trf('{0} 次成熟卡复习', data.matureLogs.length)} />
            <Stat label={tr('语法')} value={`${grammarDone} / ${data.grammar.length}`} sub={tr('掌握或跳过')} />
            <Stat label={tr('错误')} value={trf('{0} 未解决', openErrors.length)} sub={trf('{0} 已验证', data.errors.length - openErrors.length)} />
          </div>
        </Section>

        <Section title={tr('最近学习记录')} className="md:col-span-2">
          {recent.length ? (
            <ul className="divide-y divide-line text-sm">
              {recent.map((s) => (
                <li key={s.id} className="flex justify-between py-1.5">
                  <span>{ACTIVITY_LABEL[s.activityType]}{s.notes ? ` · ${s.notes}` : ''}</span>
                  <span className="text-muted">{new Date(s.startedAt).toLocaleDateString('zh-CN')} · {s.minutes} {tr('分钟')}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>{tr('还没有学习记录。点「＋ 快速记录 → 计时」开始。')}</Empty>}
        </Section>
      </div>
    </div>
  );
}
