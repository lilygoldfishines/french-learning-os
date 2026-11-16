import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Conflict } from '../db/db';
import { Button, Field, Input, Section, useToast } from '../ui/kit';
import { tr, trf } from '../i18n';
import { resolveConflict } from './engine';
import { AuthError, requestPasswordReset, setNewPassword, signIn, signOut, signUp, syncNow, useSyncStatus } from './auto';

const TABLE_LABEL: Record<string, string> = {
  vocab: '词汇', grammar: '语法', expression: '表达', sentence: '句子', error: '错误', goal: '目标', assessment: '评估', retro: '复盘', link: '关联',
};
const HIDDEN = new Set(['id', 'createdAt', 'updatedAt', 'rev']);

export function ago(iso?: string) {
  if (!iso) return tr('从未');
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return tr('刚刚');
  if (s < 3600) return trf('{0} 分钟前', Math.floor(s / 60));
  if (s < 86400) return trf('{0} 小时前', Math.floor(s / 3600));
  return new Date(iso).toLocaleDateString();
}

const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
};

function ConflictCard({ c }: { c: Conflict }) {
  const toast = useToast();
  const keys = [...new Set([...Object.keys(c.local), ...Object.keys(c.remote)])].filter(
    (k) => !HIDDEN.has(k) && JSON.stringify(c.local[k] ?? null) !== JSON.stringify(c.remote[k] ?? null),
  );
  const title = String(c.local.lemma ?? c.local.text ?? c.local.fr ?? c.local.name ?? c.local.original ?? c.local.title ?? c.id);
  const choose = async (keep: 'local' | 'remote') => {
    await resolveConflict(c.key, keep);
    toast(keep === 'local' ? tr('已保留这台设备的版本') : tr('已换成另一台设备的版本'));
    void syncNow();
  };
  return (
    <li className="rounded-md border border-line bg-panel p-3">
      <div className="mb-2 text-sm"><span className="text-muted">{tr(TABLE_LABEL[c.tbl] ?? c.tbl)} · </span><span className="fr">{title}</span></div>
      <table className="w-full table-fixed text-sm">
        <thead><tr className="text-left text-xs text-muted"><th className="w-1/4 font-normal" /><th className="font-normal">{tr('这台设备')}</th><th className="font-normal">{tr('另一台设备')}</th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-line align-top">
              <td className="py-1 pr-2 text-xs text-muted">{k}</td>
              <td className="py-1 pr-2 break-words">{show(c.local[k])}</td>
              <td className="py-1 break-words">{show(c.remote[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => choose('local')}>{tr('保留这台设备的')}</Button>
        <Button onClick={() => choose('remote')}>{tr('用另一台设备的')}</Button>
      </div>
    </li>
  );
}

export default function SyncPanel() {
  const toast = useToast();
  const s = useSyncStatus();
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), []) ?? [];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [newPw, setNewPw] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg('');
    try { await fn(); } catch (e) {
      setMsg(e instanceof AuthError && e.code === 'invalid_credentials'
        ? tr('邮箱或密码不对。注意大小写，以及 iPhone 是否在注册时自动填了「强密码」（可在「设置 → 密码」里查看）。也可以点「忘记密码」重设。')
        : (e as Error).message);
    }
    setBusy(false);
  };

  if (s.recovery) {
    return (
      <Section title={tr('云同步')}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await setNewPassword(newPw); setNewPw(''); toast(tr('新密码已设置')); }); }}>
          <p className="text-sm">{tr('请设置一个新密码。')}</p>
          <Field label={tr('新密码（至少 6 位）')}><Input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
          <Button kind="primary" type="submit" disabled={busy || newPw.length < 6}>{tr('保存新密码')}</Button>
          {msg && <p className="text-sm text-bad">{msg}</p>}
          <p className="text-xs text-muted">{tr('如果你是在 Safari 里打开的这封邮件：设好新密码后，回到主屏幕上的应用，用新密码登录。')}</p>
        </form>
      </Section>
    );
  }

  return (
    <Section title={tr('云同步')}>
      {!s.signedIn ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{tr('在每台设备上用同一个账号登录，数据就会自动同步。不登录也可以照常离线使用。')}</p>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)); }}>
            <Field label={tr('邮箱')}><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={tr('密码（至少 6 位）')}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button kind="primary" type="submit" disabled={busy || !email || password.length < 6}>{tr('登录')}</Button>
              <Button type="button" disabled={busy || !email || password.length < 6} onClick={() => run(async () => {
                const r = await signUp(email, password);
                if (r === 'confirm-email') setMsg(tr('确认邮件已发出。请在邮件里点确认链接，然后回到这里用同一个邮箱和密码登录。'));
              })}>{tr('注册新账号')}</Button>
              <Button type="button" kind="plain" className="ml-auto" disabled={busy || !email.includes('@')} onClick={() => run(async () => {
                await requestPasswordReset(email);
                setMsg(tr('重设密码的邮件已发出。点邮件里的链接，在打开的页面里设新密码。'));
              })}>{tr('忘记密码')}</Button>
            </div>
          </form>
          {msg && <p className="text-sm text-warn">{msg}</p>}
          <p className="text-xs text-muted">{tr('第一次在这台设备登录时，这台设备上已有的数据会和云端合并，不会被删除。')}</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div>{trf('已登录：{0}', s.email ?? '')}</div>
          <div className="text-muted">
            {s.state === 'syncing' ? tr('同步中…') : s.state === 'offline' ? tr('离线，联网后自动同步') : s.state === 'error' ? trf('同步出错：{0}', s.error ?? '') : trf('上次同步：{0}', ago(s.lastSyncAt))}
            {s.pending > 0 && s.state !== 'syncing' && <span>{trf(' · {0} 条待上传', s.pending)}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={s.state === 'syncing'} onClick={async () => { await syncNow(); toast(tr('同步完成')); }}>{tr('立即同步')}</Button>
            <Button onClick={() => run(signOut)}>{tr('退出登录')}</Button>
          </div>
          <p className="text-xs text-muted">{tr('打开应用、回到应用、修改数据后几秒，以及每 3 分钟，都会自动同步。')}</p>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium text-warn">{trf('{0} 条记录在两台设备上都改过，请选择保留哪个版本', conflicts.length)}</div>
          <ul className="space-y-2">{conflicts.map((c) => <ConflictCard key={c.key} c={c} />)}</ul>
        </div>
      )}
    </Section>
  );
}
