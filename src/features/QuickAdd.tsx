import { useState } from 'react';
import { addExpression, addVocab, emptyVocab, logError, ValidationError } from '../db/items';
import { articleToGender, guessArticle } from '../db/rules';
import { ACTIVITY_LABEL, ACTIVITY_TYPES, ERROR_TYPE_LABEL, ERROR_TYPES, POS, POS_LABEL, SKILL_LABEL, SKILLS, type ActivityType, type ErrorType, type Gender, type Pos, type Skill } from '../db/types';
import { Button, Field, Input, Modal, Select, Textarea, cx, useToast } from '../ui/kit';
import { startTimer, stopTimer, useTimer } from './timer';
import { insert } from '../db/db';
import { aiFillVocab, AiError, useAiConfig, type FilledVocab } from '../ai/fill';
import { displayLemma } from '../db/rules';
import { tr, trf } from '../i18n';

type Tab = 'word' | 'expr' | 'error' | 'time';

export function GenderPicker({ value, onChange }: { value: Gender; onChange: (g: Gender) => void }) {
  const opt = (g: Gender, label: string, tone: string) => (
    <button type="button" onClick={() => onChange(g)} aria-pressed={value === g}
      className={cx('flex-1 rounded-md border px-2 py-2 text-sm', value === g ? `${tone} text-white border-transparent` : 'border-line bg-panel')}>
      {label}
    </button>
  );
  return (
    <div className="flex gap-2" role="group" aria-label={tr('阴阳性')}>
      {opt('m', tr('le · 阳性'), 'bg-masc')}
      {opt('f', tr('la · 阴性'), 'bg-fem')}
      {opt('m-f', tr('同形'), 'bg-ink')}
    </div>
  );
}

function WordForm({ done }: { done: () => void }) {
  const toast = useToast();
  const [lemma, setLemma] = useState('');
  const [pos, setPos] = useState<Pos>('noun');
  const [gender, setGender] = useState<Gender>('none');
  const [def, setDef] = useState('');
  const [dupWarn, setDupWarn] = useState('');
  const [err, setErr] = useState('');
  const ai = useAiConfig();
  const [fill, setFill] = useState<FilledVocab | null>(null);
  const [busy, setBusy] = useState(false);
  const runAi = async () => {
    if (!ai) return;
    setBusy(true); setErr('');
    try {
      const f = await aiFillVocab(lemma, ai, { posHint: pos === 'noun' ? undefined : pos });
      setFill(f);
      setLemma(f.pos === 'noun' && f.article ? displayLemma(f) : f.lemma);
      setPos(f.pos);
      setGender(f.gender);
      setDef(f.defEn ?? '');
    } catch (e) { setErr(e instanceof AiError ? e.message : String(e)); }
    setBusy(false);
  };

  const onLemma = (v: string) => {
    setLemma(v);
    const g = articleToGender(guessArticle(v).article);
    if (g) setGender(g);
  };
  const save = async (allowDup = false) => {
    const { article, lemma: bare } = guessArticle(lemma);
    const art = article ?? (pos === 'noun' ? (gender === 'f' ? 'la' : gender === 'm' ? 'le' : '') : '');
    const finalArt = art && /^[aeiouéèêàâîïôûœ]/i.test(bare) && (art === 'le' || art === 'la') ? "l'" : art;
    try {
      await addVocab({ ...emptyVocab(), ...(fill ?? {}), lemma: bare, article: pos === 'noun' ? finalArt : '', pos, gender: pos === 'noun' ? gender : 'none', defEn: def }, { allowPossibleDup: allowDup });
      toast(trf('已记录：{0}', lemma));
      setLemma(''); setDef(''); setGender('none'); setDupWarn(''); setErr(''); setFill(null);
      done();
    } catch (e) {
      if (e instanceof ValidationError && e.code === 'possible-dup') setDupWarn(e.message);
      else setErr((e as Error).message);
    }
  };
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div>
        <span className="mb-1 block text-xs text-muted" aria-hidden="true">{tr('法语（可以带冠词，如 la scène）')}</span>
        <div className="flex gap-2">
          <Input autoFocus lang="fr" aria-label={tr('法语（可以带冠词，如 la scène）')} className="fr text-lg" value={lemma} onChange={(e) => { onLemma(e.target.value); setFill(null); }} />
          {ai && <Button type="button" className="shrink-0 whitespace-nowrap" disabled={!lemma.trim() || busy} onClick={runAi}>{busy ? tr('查询中…') : tr('AI 补全')}</Button>}
        </div>
      </div>
      <Field label={tr('词性')}><Select value={pos} onChange={(e) => setPos(e.target.value as Pos)} options={POS.map((p) => ({ value: p, label: POS_LABEL[p] }))} /></Field>
      {pos === 'noun' && <Field group label={tr('阴阳性（名词必填）')}><GenderPicker value={gender} onChange={setGender} /></Field>}
      <Field label={ai ? tr('英文释义') : tr('英文释义（可稍后补全）')}><Input value={def} onChange={(e) => setDef(e.target.value)} /></Field>
      {fill && (
        <div className="space-y-1 rounded-md border border-line bg-panel p-3 text-sm" aria-label={tr('AI 补全结果')}>
          {fill.ipa && <div className="fr-meta text-muted">/{fill.ipa}/{fill.plural ? ` · pl. ${fill.plural}` : ''}{fill.cefr ? ` · ${fill.cefr}` : ''}</div>}
          {fill.defZh && <div>{fill.defZh}</div>}
          {fill.examples[0] && <div className="fr italic">« {fill.examples[0].fr} »</div>}
          {fill.examples[0]?.zh && <div className="text-muted">{fill.examples[0].zh}</div>}
          {fill.notes && <div className="text-xs text-muted">{fill.notes}</div>}
          <div className="text-xs text-faint">{tr('保存时会一起存入词库，之后可在词汇页修改')}</div>
        </div>
      )}
      {err && <p className="text-sm text-bad">{err}</p>}
      {dupWarn && (
        <div className="rounded-md border border-warn/40 bg-[#fbf3e2] p-3 text-sm text-warn">
          {dupWarn}
          <div className="mt-2 flex gap-2"><Button type="button" onClick={() => save(true)}>{tr('仍然保存为新词条')}</Button><Button type="button" onClick={() => setDupWarn('')}>{tr('取消')}</Button></div>
        </div>
      )}
      <Button kind="primary" type="submit" className="w-full py-2">{tr('保存')}</Button>
    </form>
  );
}

function ExprForm({ done }: { done: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [def, setDef] = useState('');
  const [err, setErr] = useState('');
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      try { await addExpression({ text, defEn: def, examples: [] }); toast(tr('已记录表达')); setText(''); setDef(''); done(); }
      catch (x) { setErr((x as Error).message); }
    }}>
      <Field label={tr('法语表达')}><Input autoFocus lang="fr" className="fr text-lg" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <Field label={tr('意思（英文或中文）')}><Input value={def} onChange={(e) => setDef(e.target.value)} /></Field>
      {err && <p className="text-sm text-bad">{err}</p>}
      <Button kind="primary" type="submit" className="w-full py-2">{tr('保存')}</Button>
    </form>
  );
}

export function ErrorForm({ done }: { done: () => void }) {
  const toast = useToast();
  const [original, setOriginal] = useState('');
  const [corrected, setCorrected] = useState('');
  const [type, setType] = useState<ErrorType>('gender');
  const [grammarRef, setGrammarRef] = useState('');
  const [explanation, setExplanation] = useState('');
  const [source, setSource] = useState('');
  const [err, setErr] = useState('');
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      try {
        const r = await logError({ original, corrected, errorType: type, grammarRef, explanation, source }, { merge: true });
        toast(r.merged ? tr('与已有错误合并，出现次数 +1') : tr('已记录错误'));
        setOriginal(''); setCorrected(''); setExplanation(''); setGrammarRef('');
        done();
      } catch (x) { setErr((x as Error).message); }
    }}>
      <Field label={tr('我写 / 说的')}><Textarea lang="fr" rows={2} className="fr" value={original} onChange={(e) => setOriginal(e.target.value)} /></Field>
      <Field label={tr('正确的说法')}><Textarea lang="fr" rows={2} className="fr" value={corrected} onChange={(e) => setCorrected(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('错误类型')}><Select value={type} onChange={(e) => setType(e.target.value as ErrorType)} options={ERROR_TYPES.map((t) => ({ value: t, label: ERROR_TYPE_LABEL[t] }))} /></Field>
        <Field label={tr('相关语法点（可选）')}><Input value={grammarRef} onChange={(e) => setGrammarRef(e.target.value)} /></Field>
      </div>
      <Field label={tr('解释（可选）')}><Input value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <Field label={tr('出处（可选，如：周记、和制片聊天）')}><Input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
      {err && <p className="text-sm text-bad">{err}</p>}
      <Button kind="primary" type="submit" className="w-full py-2">{tr('保存')}</Button>
    </form>
  );
}

function TimeForm({ done }: { done: () => void }) {
  const toast = useToast();
  const { running, elapsedMin, state } = useTimer();
  const [act, setAct] = useState<ActivityType>('active');
  const [skill, setSkill] = useState<Skill | 'mixed'>('mixed');
  const [manual, setManual] = useState('');
  const [notes, setNotes] = useState('');
  const actOpts = ACTIVITY_TYPES.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }));
  const skillOpts = [{ value: 'mixed', label: tr('综合') }, ...SKILLS.map((s) => ({ value: s, label: SKILL_LABEL[s] }))];
  if (running && state) {
    return (
      <div className="space-y-3">
        <p className="text-sm">{tr('正在计时：')}{ACTIVITY_LABEL[state.activityType]} · {elapsedMin} {tr('分钟')}</p>
        <Field label={tr('学了什么 / 结果（可选）')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Button kind="primary" className="w-full py-2" onClick={async () => { const m = await stopTimer(notes); toast(trf('已记录 {0} 分钟', m)); setNotes(''); done(); }}>{tr('结束并记录')}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('活动类型')}><Select value={act} onChange={(e) => setAct(e.target.value as ActivityType)} options={actOpts} /></Field>
        <Field label={tr('能力')}><Select value={skill} onChange={(e) => setSkill(e.target.value as Skill | 'mixed')} options={skillOpts} /></Field>
      </div>
      <Button kind="primary" className="w-full py-2" onClick={async () => { await startTimer(act, skill); toast(tr('开始计时')); done(); }}>{tr('开始计时')}</Button>
      <div className="border-t border-line pt-3">
        <Field label={tr('或者直接补记分钟数')}><Input type="number" inputMode="numeric" min={1} value={manual} onChange={(e) => setManual(e.target.value)} /></Field>
        <Field label={tr('备注')} className="mt-2"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Button className="mt-2 w-full" disabled={!Number(manual)} onClick={async () => {
          await insert('session', { startedAt: new Date().toISOString(), minutes: Number(manual), activityType: act, skill, notes, outcome: '' });
          toast(trf('已补记 {0} 分钟', manual)); setManual(''); setNotes(''); done();
        }}>{tr('补记')}</Button>
      </div>
    </div>
  );
}

export default function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('word');
  const tabs: [Tab, string][] = [['word', tr('词汇')], ['expr', tr('表达')], ['error', tr('错误')], ['time', tr('计时')]];
  return (
    <Modal open={open} onClose={onClose} title={tr('快速记录')}>
      <div className="mb-4 flex gap-1 rounded-md bg-line/60 p-1 text-sm" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('flex-1 rounded py-1.5', tab === k && 'bg-panel shadow-sm')}>{l}</button>
        ))}
      </div>
      {tab === 'word' && <WordForm done={() => {}} />}
      {tab === 'expr' && <ExprForm done={() => {}} />}
      {tab === 'error' && <ErrorForm done={() => {}} />}
      {tab === 'time' && <TimeForm done={onClose} />}
    </Modal>
  );
}
