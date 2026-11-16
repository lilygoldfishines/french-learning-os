import { describe, expect, it } from 'vitest';
import { aiFillVocab, AiError, getAiConfig, mergeFill, saveAiConfig } from './fill';
import { emptyVocab } from '../db/items';
import { exportAll, restore } from '../io/backup';
import { db } from '../db/db';

const entry = {
  lemma: 'scène', article: 'la', gender: 'f', plural: 'scènes', pos: 'noun', ipa: '/sɛn/',
  defEn: 'scene; stage', defZh: '场景；舞台',
  examples: [{ fr: 'On tourne la scène demain.', en: 'We shoot the scene tomorrow.', zh: '我们明天拍这场戏。' }],
  synonyms: [], antonyms: [], collocations: ['tourner une scène'], prepositions: [], conjugation: '', topics: ['cinema', 'bogus'], cefr: 'A2', notes: '',
};
const ok = (input: unknown) => async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 't', name: 'fill_vocab_entry', input }] }), { status: 200 });
const cfg = { apiKey: 'sk-ant-test', model: 'claude-haiku-5-5' };

describe('AI fill', () => {
  it('sends the browser-access header with the key and forces the tool', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => { sent = { url, init }; return ok(entry)(); }) as unknown as typeof fetch;
    const f = await aiFillVocab('scene', cfg, { fetchFn });
    const h = sent!.init.headers as Record<string, string>;
    expect(sent!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(h['x-api-key']).toBe('sk-ant-test');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(String(sent!.init.body));
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'fill_vocab_entry' });
    expect(f).toMatchObject({ lemma: 'scène', article: 'la', gender: 'f', ipa: 'sɛn', defZh: '场景；舞台', topics: ['cinema'] });
  });

  it('infers gender from the article and clears article for non-nouns', async () => {
    const f1 = await aiFillVocab('cadrage', cfg, { fetchFn: ok({ ...entry, lemma: 'cadrage', article: 'le', gender: 'none' }) as unknown as typeof fetch });
    expect(f1.gender).toBe('m');
    const f2 = await aiFillVocab('tourner', cfg, { fetchFn: ok({ ...entry, lemma: 'tourner', article: 'le', gender: 'm', pos: 'verb' }) as unknown as typeof fetch });
    expect(f2).toMatchObject({ article: '', gender: 'none', pos: 'verb' });
  });

  it('turns API failures into readable errors', async () => {
    const r = (status: number, msg = '') => (async () => new Response(JSON.stringify({ error: { message: msg } }), { status })) as unknown as typeof fetch;
    await expect(aiFillVocab('x', cfg, { fetchFn: r(401) })).rejects.toThrow('API 密钥无效');
    await expect(aiFillVocab('x', cfg, { fetchFn: r(400, 'Your credit balance is too low') })).rejects.toThrow('余额不足');
    await expect(aiFillVocab('x', cfg, { fetchFn: (async () => { throw new TypeError('net'); }) as unknown as typeof fetch })).rejects.toBeInstanceOf(AiError);
    await expect(aiFillVocab('x', cfg, { fetchFn: ok({ lemma: 'x', pos: 'nom' }) as unknown as typeof fetch })).rejects.toThrow('格式不对');
    await expect(aiFillVocab('  ', cfg)).rejects.toThrow('请先输入');
  });

  it('merge never overwrites what the learner typed', () => {
    const draft = { ...emptyVocab(), lemma: 'scène', article: 'la', gender: 'f' as const, defEn: 'my own definition', notes: 'mine' };
    const filled = mergeFill(draft, { ...emptyVocab(), ...entry, gender: 'f', pos: 'noun', ipa: 'sɛn', topics: ['cinema'], cefr: 'A2' } as never);
    expect(filled.defEn).toBe('my own definition');
    expect(filled.notes).toBe('mine');
    expect(filled.defZh).toBe('场景；舞台');
    expect(filled.examples).toHaveLength(1);
  });

  it('keeps the API key out of backups and restores', async () => {
    await saveAiConfig(cfg);
    const b = await exportAll();
    expect(JSON.stringify(b)).not.toContain('sk-ant-test');
    await db.meta.clear();
    await restore({ ...b, meta: [...b.meta, { key: 'aiConfig', value: { apiKey: 'sk-ant-evil', model: 'x' } }] }, 'merge');
    expect(await getAiConfig()).toBeNull();
  });
});
