import { describe, expect, it } from 'vitest';
import { all, db, remove, update } from './db';
import { addExpression, addVocab, emptyVocab, logError, recordCorrectUse, recordRecurrence, saveVocab, ValidationError } from './items';
import { deriveErrorStatus, displayLemma, normalize } from './rules';
import { bootstrap } from './bootstrap';
import { buildQueue, grade, Rating } from '../srs';
import { DEFAULT_SETTINGS, type ErrorEntry, type Vocab } from './types';
import { exportAll, restore, verifyBackup, vocabToCsv, csvToVocabItems, vocabToQuizlet } from '../io/backup';
import { buildPreview, commit, extractItems } from '../io/aiImport';

const noun = (lemma: string, gender: 'm' | 'f', article = gender === 'm' ? 'le' : 'la') => ({ ...emptyVocab(), lemma, article, gender, pos: 'noun' as const });

describe('vocab CRUD + gender', () => {
  it('adds, edits, searches and soft-deletes vocab; creates a review card', async () => {
    const v = await addVocab({ ...noun('tournage', 'm'), defEn: 'film shoot' });
    expect(v.gender).toBe('m');
    expect(await db.card.where('itemId').equals(v.id).count()).toBe(1);
    await saveVocab(v.id, { defZh: '拍摄' });
    const got = await db.vocab.get(v.id);
    expect(got?.defZh).toBe('拍摄');
    expect(got?.rev).toBe(2);
    const hits = (await all<Vocab>('vocab')).filter((x) => x.lemma.includes('tourn'));
    expect(hits).toHaveLength(1);
    await remove('vocab', v.id);
    expect(await all<Vocab>('vocab')).toHaveLength(0);
    expect((await db.card.where('itemId').equals(v.id).first())?.deletedAt).toBeTruthy();
  });

  it('rejects a noun without gender', async () => {
    await expect(addVocab({ ...emptyVocab(), lemma: 'maison', pos: 'noun', gender: 'none' })).rejects.toThrow(/阴阳性/);
    await expect(saveVocab((await addVocab(noun('maison', 'f'))).id, { gender: 'none' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores feminine and masculine correctly and round-trips through CSV', async () => {
    await addVocab(noun('scène', 'f'));
    await addVocab(noun('plan', 'm'));
    const rows = await all<Vocab>('vocab');
    const csv = vocabToCsv(rows);
    const back = csvToVocabItems(csv);
    expect(back.find((r) => r.lemma === 'scène')?.gender).toBe('f');
    expect(back.find((r) => r.lemma === 'plan')?.gender).toBe('m');
    expect(vocabToQuizlet(rows)).toContain('la scène (n.f)');
  });
});

describe('duplicates', () => {
  it('blocks exact duplicates and flags possible ones', async () => {
    await addVocab(noun('livre', 'm'));
    await expect(addVocab(noun('Livre', 'm'))).rejects.toThrow(/已存在/);
    await expect(addVocab(noun('livre', 'f'))).rejects.toThrow(/可能重复/);
    await addVocab(noun('livre', 'f'), { allowPossibleDup: true });
    expect(await all('vocab')).toHaveLength(2);
    expect(normalize("L’école")).toBe('école');
    expect(displayLemma({ lemma: 'apprenant', article: 'l’' })).toBe("l'apprenant");
    expect(displayLemma({ lemma: 'scène', article: 'la' })).toBe('la scène');
    const saved = await addVocab({ ...emptyVocab(), lemma: 'école', article: 'l’', gender: 'f', pos: 'noun' });
    expect(saved.article).toBe("l'");
  });
  it('blocks duplicate expressions', async () => {
    await addExpression({ text: 'avoir le cafard', examples: [] });
    await expect(addExpression({ text: ' Avoir  le cafard ', examples: [] })).rejects.toThrow();
  });
});

describe('error bank', () => {
  it('merges similar errors and counts recurrences', async () => {
    const a = await logError({ original: 'je suis allé à la France', corrected: 'je suis allé en France', errorType: 'preposition', grammarRef: 'prépositions + pays' });
    const b = await logError({ original: 'il habite à la Chine', corrected: 'il habite en Chine', errorType: 'preposition', grammarRef: 'Prépositions + pays' }, { merge: true });
    expect(b.merged).toBe(true);
    expect(b.id).toBe(a.id);
    expect((await db.error.get(a.id))?.occurrences).toHaveLength(2);
  });

  it('is not verified after one correction; needs 2 uses ≥7 days apart after last occurrence', () => {
    const e = { occurrences: [{ date: '2026-11-01T10:00:00Z' }], correctUses: [] as string[] };
    expect(deriveErrorStatus(e)).toBe('open');
    expect(deriveErrorStatus({ ...e, correctUses: ['2026-11-02T10:00:00Z'] })).toBe('practicing');
    expect(deriveErrorStatus({ ...e, correctUses: ['2026-11-02T10:00:00Z', '2026-11-05T10:00:00Z'] })).toBe('practicing');
    expect(deriveErrorStatus({ ...e, correctUses: ['2026-11-02T10:00:00Z', '2026-11-10T10:00:00Z'] })).toBe('verified');
    // a new occurrence after verification reopens it
    expect(deriveErrorStatus({ occurrences: [...e.occurrences, { date: '2026-11-12T00:00:00Z' }], correctUses: ['2026-11-02T10:00:00Z', '2026-11-10T10:00:00Z'] })).toBe('open');
  });

  it('updates status through recordCorrectUse / recordRecurrence', async () => {
    const { id } = await logError({ original: 'la problème', corrected: 'le problème', errorType: 'gender', date: '2026-10-01T00:00:00Z' });
    await recordCorrectUse(id, '2026-10-05T00:00:00Z');
    expect((await db.error.get(id))?.status).toBe('practicing');
    await recordCorrectUse(id, '2026-10-20T00:00:00Z');
    expect((await db.error.get(id))?.status).toBe('verified');
    await recordRecurrence(id);
    expect((await db.error.get(id))?.status).toBe('open');
  });
});

describe('spaced repetition', () => {
  it('schedules after grading and respects the new-card cap', async () => {
    for (let i = 0; i < 20; i++) await addVocab(noun(`mot${i}`, 'm'));
    const s = { ...DEFAULT_SETTINGS, dailyNewLimit: 5 };
    const now = new Date('2026-11-16T09:00:00');
    let q = await buildQueue(s, now);
    expect(q.fresh).toHaveLength(5);
    await grade(q.fresh[0].id, Rating.Good, s, now);
    await grade(q.fresh[1].id, Rating.Easy, s, now);
    const easy = await db.card.get(q.fresh[1].id);
    expect(Date.parse(easy!.due)).toBeGreaterThan(now.getTime() + 86400000); // Easy on a new card → days out
    expect(await db.reviewLog.count()).toBe(2);
    q = await buildQueue(s, now);
    expect(q.newToday).toBe(2);
    expect(q.fresh).toHaveLength(3);
  });

  it('defers overdue reviews beyond the daily cap', async () => {
    for (let i = 0; i < 6; i++) await addVocab(noun(`vieux${i}`, 'm'));
    const s = { ...DEFAULT_SETTINGS, dailyReviewLimit: 4 };
    const t0 = new Date('2026-10-01T09:00:00');
    for (const c of await db.card.toArray()) await grade(c.id, Rating.Easy, s, t0);
    const later = new Date('2027-03-01T09:00:00');
    const q = await buildQueue(s, later);
    expect(q.due).toHaveLength(4);
    expect(q.overdueDeferred).toBe(2);
  });
});

describe('backup', () => {
  it('exports, verifies, detects tampering, and restores (replace + merge)', async () => {
    await bootstrap();
    await addVocab(noun('montage', 'm'));
    const b = await exportAll();
    expect((await verifyBackup(JSON.parse(JSON.stringify(b)))).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(b));
    tampered.data.vocab[0].lemma = 'hacked';
    expect((await verifyBackup(tampered)).ok).toBe(false);

    const id = (await all<Vocab>('vocab'))[0].id;
    await update<Vocab>('vocab', id, { defZh: '剪辑（新）' });
    const merged = await restore(b, 'merge');
    expect((await db.vocab.get(id))?.defZh).toBe('剪辑（新）'); // older backup copy does not overwrite newer local
    expect(merged.added).toBe(0);

    await db.vocab.clear();
    const rep = await restore(b, 'replace');
    expect(rep.added).toBeGreaterThan(0);
    expect((await db.vocab.get(id))?.lemma).toBe('montage');
    expect(await db.grammar.count()).toBeGreaterThan(40);
  });
});

describe('AI import', () => {
  it('validates, previews duplicates, never overwrites, and commits only confirmed rows', async () => {
    await addVocab(noun('caméra', 'f'));
    await logError({ original: 'la problème', corrected: 'le problème', errorType: 'gender' });
    const json = JSON.stringify({
      vocab: [
        { lemma: 'la caméra', pos: 'noun', defEn: 'camera' }, // exact dup (article-derived gender)
        { lemma: 'le cadrage', pos: 'noun', defEn: 'framing' }, // new, gender inferred from article
        { lemma: 'repérage', pos: 'noun' }, // invalid: noun with no gender
        { lemma: 'tourner', pos: 'verb', defEn: 'to shoot' },
      ],
      errors: [{ original: 'la système', corrected: 'le problème', errorType: 'gender' }],
      bogus: [],
    });
    const { items, problems } = extractItems('```json\n' + json + '\n```');
    expect(problems).toContain('忽略未知字段：bogus');
    const rows = await buildPreview(items);
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'new', 'invalid', 'new', 'similar-error']);
    expect(rows[1].data?.gender).toBe('m');
    const before = (await all<Vocab>('vocab'))[0];
    const rep = await commit(rows);
    expect(rep).toMatchObject({ added: 2, merged: 1, skipped: 2 });
    const after = await db.vocab.get(before.id);
    expect(after?.updatedAt).toBe(before.updatedAt);
    const errs = await all<ErrorEntry>('error');
    expect(errs).toHaveLength(1);
    expect(errs[0].occurrences).toHaveLength(2);
  });

  it('reports JSON syntax errors and schema errors readably', async () => {
    expect(extractItems('{oops').problems[0]).toMatch(/JSON 格式错误/);
    const rows = await buildPreview(extractItems(JSON.stringify({ schema: 'flos.vocab.v1', items: [{ lemma: 'x', pos: 'nom' }] })).items);
    expect(rows[0].status).toBe('invalid');
    expect(rows[0].issues[0]).toMatch(/pos/);
  });
});
