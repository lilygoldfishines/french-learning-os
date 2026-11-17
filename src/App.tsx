import { useEffect, useState } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { bootstrap, requestPersistence } from './db/bootstrap';
import { db, getMeta } from './db/db';
import { ToastProvider, cx } from './ui/kit';
import QuickAdd from './features/QuickAdd';
import Dashboard from './pages/Dashboard';
import Review from './pages/Review';
import Learn from './pages/Learn';
import VocabPage from './pages/Vocab';
import GrammarPage from './pages/Grammar';
import ExpressionsPage from './pages/Expressions';
import SentencesPage from './pages/Sentences';
import ErrorsPage from './pages/Errors';
import PlanPage from './pages/Plan';
import AssessPage from './pages/Assess';
import DataPage from './pages/Data';
import SettingsPage from './pages/Settings';
import MorePage from './pages/More';
import ConjugationPage from './pages/Conjugation';
import { useTimer } from './features/timer';
import { tr, trf } from './i18n';
import { lang, setLang } from './i18n';
import { startSync, useSyncStatus } from './sync/auto';
import { ago } from './sync/SyncPanel';

export const NAV: { group: string; items: { to: string; label: string; soon?: boolean }[] }[] = [
  { group: tr('今天'), items: [{ to: '/', label: tr('控制台') }, { to: '/learn', label: tr('学习') }, { to: '/review', label: tr('复习') }] },
  { group: tr('知识库'), items: [
    { to: '/vocab', label: tr('词汇') }, { to: '/grammar', label: tr('语法') }, { to: '/expressions', label: tr('表达') },
    { to: '/sentences', label: tr('句子') }, { to: '/errors', label: tr('错误库') },
  ] },
  { group: tr('训练'), items: [{ to: '/conjugation', label: tr('动词变位') }, { to: '#', label: tr('听 · 说 · 读 · 写'), soon: true }, { to: '#', label: 'DELF / DALF', soon: true }] },
  { group: tr('沉浸'), items: [{ to: '#', label: tr('生活与行业场景'), soon: true }, { to: '#', label: tr('文化与思想'), soon: true }, { to: '#', label: tr('资源库'), soon: true }] },
  { group: tr('规划与分析'), items: [{ to: '/plan', label: tr('学习计划') }, { to: '/assess', label: tr('能力评估') }] },
  { group: tr('工具'), items: [{ to: '/data', label: tr('导入导出 · AI') }, { to: '/settings', label: tr('设置与备份') }] },
];

function Sidebar({ onQuick }: { onQuick: () => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-line px-4 py-6 md:flex">
      <div className="mb-6 px-2">
        <div className="font-display text-xl leading-tight">French Learning OS</div>
        <div className="text-xs text-muted">{tr('个人法语学习系统')}</div>
      </div>
      <button onClick={onQuick} className="mb-5 rounded-md bg-ink px-3 py-2 text-left text-sm text-paper">{tr('＋ 快速记录')} <span className="float-right text-paper/50">N</span></button>
      <nav className="flex flex-col gap-4 text-sm">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1 px-2 text-[11px] tracking-wider text-faint">{g.group}</div>
            {g.items.map((i) =>
              i.soon ? (
                <div key={i.label} className="px-2 py-1 text-faint">{i.label} <span className="text-[10px]">{tr('· 第四阶段')}</span></div>
              ) : (
                <NavLink key={i.to} to={i.to} end className={({ isActive }) => cx('block rounded px-2 py-1', isActive ? 'bg-line/70 font-medium text-ink' : 'text-muted hover:text-ink')}>
                  {i.label}
                </NavLink>
              ),
            )}
          </div>
        ))}
      </nav>
      <SyncLine />
      <div className="flex gap-3 px-2 pt-3 text-xs" role="group" aria-label="Language">
        <button className={lang === 'zh' ? 'font-semibold text-ink' : 'text-muted'} aria-pressed={lang === 'zh'} onClick={() => lang !== 'zh' && setLang('zh')}>中文</button>
        <button className={lang === 'en' ? 'font-semibold text-ink' : 'text-muted'} aria-pressed={lang === 'en'} onClick={() => lang !== 'en' && setLang('en')}>English</button>
      </div>
    </aside>
  );
}

function SyncLine() {
  const s = useSyncStatus();
  if (!s.signedIn) return <div className="mt-auto" />;
  return (
    <NavLink to="/settings" className="mt-auto block px-2 pt-6 text-xs text-muted">
      {s.state === 'syncing' ? tr('同步中…') : s.state === 'error' ? tr('同步出错') : s.state === 'offline' ? tr('离线') : trf('已同步 · {0}', ago(s.lastSyncAt))}
    </NavLink>
  );
}

function ConflictBanner() {
  const s = useSyncStatus();
  if (!s.conflicts) return null;
  return (
    <div className="border-b border-warn/30 bg-[#fbf3e2] px-4 py-2 text-sm text-warn">
      {trf('{0} 条记录在两台设备上都改过。', s.conflicts)}
      <NavLink to="/settings" className="ml-2 underline">{tr('去处理')}</NavLink>
    </div>
  );
}

function BottomNav({ onQuick }: { onQuick: () => void }) {
  const loc = useLocation();
  const LIBRARY = ['/vocab', '/grammar', '/expressions', '/sentences', '/errors'];
  const tab = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => cx('flex flex-1 flex-col items-center py-3 text-xs', isActive || (to === '/vocab' && LIBRARY.includes(loc.pathname)) ? 'font-semibold text-ink' : 'text-muted')}>
      {label}
    </NavLink>
  );
  // the add button floats above the bar; on study pages it would cover the answer buttons, so it steps aside there
  const hideFab = ['/learn', '/review', '/conjugation'].includes(loc.pathname);
  return (
    <>
      {!hideFab && (
        <button onClick={onQuick} aria-label={tr('快速记录')}
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.25rem)' }}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-3xl leading-none text-paper shadow-lg md:hidden">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-line bg-paper/95 backdrop-blur md:hidden" aria-label={tr('主导航')}>
        {tab('/', tr('今天'), true)}
        {tab('/learn', tr('学习'))}
        {tab('/review', tr('复习'))}
        {tab('/vocab', tr('知识库'))}
        {tab('/more', tr('更多'))}
      </nav>
    </>
  );
}

function TimerBar() {
  const { running, elapsedMin, stop } = useTimer();
  const loc = useLocation();
  if (!running) return null;
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-accent-soft px-4 py-2 text-sm">
      <span>{tr('学习计时中 ·')} {elapsedMin} {tr('分钟')}</span>
      <button className="text-accent underline" onClick={() => stop()} data-path={loc.pathname}>{tr('结束并记录')}</button>
    </div>
  );
}

function BackupBanner() {
  const last = useLiveQuery(() => getMeta<string | null>('lastBackupAt', null), []);
  const hasData = useLiveQuery(() => db.vocab.count(), []);
  if (last === undefined || !hasData) return null;
  const days = last ? (Date.now() - Date.parse(last)) / 86400000 : Infinity;
  if (days < 7) return null;
  return (
    <div className="border-b border-warn/30 bg-[#fbf3e2] px-4 py-2 text-sm text-warn">
      {last ? trf('已经 {0} 天没有备份了。', Math.floor(days)) : tr('还没有备份过。')}
      <NavLink to="/settings" className="ml-2 underline">{tr('去备份')}</NavLink>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [quick, setQuick] = useState(false);
  useEffect(() => {
    bootstrap().then(() => { setReady(true); void startSync(); });
    requestPersistence();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setQuick(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!ready) return <div className="p-8 text-muted">{tr('正在打开数据库…')}</div>;
  return (
    <ToastProvider>
      <HashRouter>
        <div className="flex min-h-full">
          <Sidebar onQuick={() => setQuick(true)} />
          <div className="min-w-0 flex-1">
            <TimerBar />
            <ConflictBanner />
            <BackupBanner />
            <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 md:px-8 md:pb-12">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/review" element={<Review />} />
                <Route path="/vocab" element={<VocabPage />} />
                <Route path="/grammar" element={<GrammarPage />} />
                <Route path="/expressions" element={<ExpressionsPage />} />
                <Route path="/sentences" element={<SentencesPage />} />
                <Route path="/errors" element={<ErrorsPage />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/assess" element={<AssessPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/more" element={<MorePage />} />
                <Route path="/conjugation" element={<ConjugationPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
        <BottomNav onQuick={() => setQuick(true)} />
        <QuickAdd open={quick} onClose={() => setQuick(false)} />
      </HashRouter>
    </ToastProvider>
  );
}
