import { useState } from 'react';
import { all } from '../db/db';
import type { Vocab } from '../db/types';
import { buildPreview, extractItems, KIND_LABEL, type Kind, type PreviewRow } from '../io/aiImport';
import { csvToVocabItems, download, vocabToCsv, vocabToQuizlet } from '../io/backup';
import ImportPreview from '../features/ImportPreview';
import { Button, Field, PageHeader, Section, Select, Textarea, useToast } from '../ui/kit';

export const STARTER_PROMPT = `请分析下面的法语材料，按我的 French Learning OS 格式输出 JSON（只输出 JSON，不要其他文字）。
我的水平：B1，目标 B2/C1。词汇解释用英文，中文辅助。所有名词必须带冠词并标注阴阳性。

格式：
{
  "vocab": [{"lemma": "tournage", "article": "le", "gender": "m", "pos": "noun", "plural": "tournages", "ipa": "tuʁ.naʒ",
             "defEn": "film shoot", "defZh": "拍摄", "examples": [{"fr": "...", "en": "...", "zh": "..."}],
             "synonyms": [], "collocations": [], "prepositions": [], "topics": ["cinema"], "cefr": "B1"}],
  "expressions": [{"text": "...", "defEn": "...", "defZh": "...", "register": "courant|soutenu|familier|argotique|professionnel|littéraire",
                   "context": "...", "examples": [{"fr": "...", "en": "..."}]}],
  "sentences": [{"fr": "...", "en": "...", "zh": "...", "source": "..."}],
  "errors": [{"original": "...", "corrected": "...", "errorType": "gender|article|conjugation|agreement|preposition|word-choice|structure|word-order|spelling|pronunciation|unnatural|register",
              "explanation": "...", "grammarRef": "..."}]
}
pos 只能是：noun, verb, adjective, adverb, preposition, conjunction, pronoun, determiner, interjection, phrase
gender 只能是：m, f, m-f, none
topics 可选：daily, food, transport, health, housing, admin, finance, relationships, work, cinema, art, society, academic, literature, abstract, news, idioms

材料：
`;

export default function DataPage() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [hint, setHint] = useState<Kind>('vocab');
  const [problems, setProblems] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [key, setKey] = useState(0);

  const preview = async (items: { kind: Kind; raw: unknown }[]) => { setRows(await buildPreview(items)); setKey((k) => k + 1); };

  return (
    <div>
      <PageHeader title="导入导出 · AI" sub="在 Claude 里分析材料，把 JSON 结果导回这里；导入前逐条确认" />
      <div className="space-y-4">
        <Section title="1 · 复制给 Claude 的提示词">
          <p className="mb-2 text-sm text-muted">把这段提示词和你的法语材料（文章、作文、被纠正的句子）一起发给 Claude。完整的 Prompt 库会在第五阶段加入。</p>
          <Textarea readOnly rows={5} className="font-mono text-xs" value={STARTER_PROMPT} />
          <Button className="mt-2" onClick={async () => { await navigator.clipboard.writeText(STARTER_PROMPT); toast('已复制'); }}>复制提示词</Button>
        </Section>

        <Section title="2 · 粘贴 AI 返回的 JSON">
          <Textarea rows={8} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"vocab": [...], "errors": [...]}' aria-label="粘贴 JSON" />
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="如果是纯数组，内容类型是"><Select value={hint} onChange={(e) => setHint(e.target.value as Kind)} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} /></Field>
            <Button kind="primary" disabled={!text.trim()} onClick={async () => {
              const { items, problems } = extractItems(text, hint);
              setProblems(problems);
              if (items.length) await preview(items); else setRows(null);
            }}>校验并预览</Button>
          </div>
          {problems.map((p) => <p key={p} className="mt-2 text-sm text-warn">{p}</p>)}
          {rows && (
            <div className="mt-4">
              <ImportPreview key={key} rows={rows} onDone={(r) => {
                toast(`导入 ${r.added} 条 · 合并 ${r.merged} · 跳过 ${r.skipped}${r.failed.length ? ` · 失败 ${r.failed.length}` : ''}`, r.failed.length ? 'bad' : 'good');
                setRows(null); setText('');
              }} />
            </div>
          )}
        </Section>

        <Section title="词汇 CSV / Quizlet">
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => { download(`vocab-${new Date().toISOString().slice(0, 10)}.csv`, vocabToCsv(await all<Vocab>('vocab')), 'text/csv'); }}>导出 CSV（完整字段）</Button>
            <Button onClick={async () => { download(`quizlet-${new Date().toISOString().slice(0, 10)}.txt`, vocabToQuizlet(await all<Vocab>('vocab')), 'text/plain'); }}>导出 Quizlet 格式</Button>
            <Button onClick={async () => { await navigator.clipboard.writeText(vocabToQuizlet(await all<Vocab>('vocab'))); toast('已复制，可直接粘贴到 Quizlet 导入框'); }}>复制 Quizlet 格式</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-line bg-panel px-3 py-1.5 text-sm hover:border-faint">
              导入 CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const items = csvToVocabItems(await f.text()).map((raw) => ({ kind: 'vocab' as const, raw }));
                await preview(items);
                e.target.value = '';
              }} />
            </label>
          </div>
          <p className="mt-2 text-xs text-faint">Quizlet 格式：法语（带冠词和阴阳性）与释义之间用 Tab 分隔，每行一张卡。导入 CSV 同样会先预览，不会覆盖已有词条。</p>
        </Section>
      </div>
    </div>
  );
}
