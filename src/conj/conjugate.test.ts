import { describe, expect, it } from 'vitest';
import { checkAnswer, conjugate, type Tense } from './conjugate';

const row = async (verb: string, tense: Tense) => (await conjugate(verb, [tense]))!.tables[0].forms;

describe('conjugation engine', () => {
  it('conjugates irregular and stem-changing verbs with pronouns and elision', async () => {
    expect((await row('prendre', 'PRESENT')).map((f) => f.full)).toEqual(['je prends', 'tu prends', 'il/elle prend', 'nous prenons', 'vous prenez', 'ils/elles prennent']);
    expect((await row('avoir', 'PRESENT'))[0].full).toBe("j'ai");
    expect((await row('acheter', 'FUTUR'))[0].form).toBe('achèterai');
    expect((await row('appeler', 'PRESENT'))[5].form).toBe('appellent');
    expect((await row('être', 'IMPARFAIT'))[3].form).toBe('étions');
  });

  it('handles auxiliaries and agreement in compound tenses', async () => {
    const pc = await row('aller', 'PASSE_COMPOSE');
    expect(pc[0].full).toBe('je suis allé');
    expect(pc[3].form).toBe('sommes allés');
    expect(pc[0].alts).toContain('suis allée');
    expect((await row('être', 'PASSE_COMPOSE'))[0].full).toBe("j'ai été");
    expect((await conjugate('prendre', ['PASSE_COMPOSE']))!.tables[0].aux).toBe('avoir');
  });

  it('handles pronominal verbs, subjunctive "que", imperative persons', async () => {
    expect((await row('se lever', 'PRESENT'))[0].full).toBe('je me lève');
    expect((await row("s'appeler", 'PRESENT'))[0].full).toBe("je m'appelle");
    const subj = await row('faire', 'SUBJONCTIF_PRESENT');
    expect(subj[0].full).toBe('que je fasse');
    expect(subj[2].full).toBe("qu'il/elle fasse");
    expect((await row('parler', 'IMPERATIF_PRESENT')).map((f) => f.form)).toEqual(['parle', 'parlons', 'parlez']);
  });

  it('classifies groups and flags irregular forms', async () => {
    expect((await conjugate('finir'))!.group).toBe(2);
    expect((await conjugate('parler'))!.group).toBe(1);
    expect((await conjugate('partir'))!.group).toBe(3);
    const parler = await row('parler', 'PRESENT');
    expect(parler.some((f) => f.irregular)).toBe(false);
    const acheter = await row('acheter', 'PRESENT');
    expect(acheter.map((f) => f.irregular)).toEqual([true, true, true, false, false, true]); // achète vs achetons
    expect((await row('appeler', 'PRESENT'))[0].irregular).toBe(true);
    expect((await row('manger', 'PRESENT'))[3].irregular).toBe(true); // mangeons
    expect((await row('finir', 'PRESENT')).some((f) => f.irregular)).toBe(false);
    expect((await row('parler', 'PASSE_COMPOSE')).some((f) => f.irregular)).toBe(false);
    expect((await row('aller', 'PASSE_COMPOSE'))[3].irregular).toBe(false); // allés: regular participle + agreement
    const venir = await row('venir', 'PRESENT');
    expect(venir.map((f) => f.irregular)).toEqual([true, true, true, false, false, true]);
    expect((await row('aller', 'FUTUR'))[0].irregular).toBe(true);
    expect((await row('parler', 'FUTUR'))[0].irregular).toBe(false);
    expect(await conjugate('zzzfoo')).toBeNull();
  });

  it('checks answers: with/without pronoun, accents, feminine agreement', async () => {
    const pc = await row('prendre', 'PASSE_COMPOSE');
    expect(checkAnswer('avons pris', pc[3])).toBe('correct');
    expect(checkAnswer('Nous avons pris.', pc[3])).toBe('correct');
    expect(checkAnswer('nous avons prendu', pc[3])).toBe('wrong');
    const pr = await row('préférer', 'PRESENT');
    expect(checkAnswer('prefere', pr[0])).toBe('accent');
    expect(checkAnswer('je préfère', pr[0])).toBe('correct');
    const venir = await row('venir', 'PASSE_COMPOSE');
    expect(checkAnswer('elle est venue', venir[2])).toBe('correct');
    expect(checkAnswer('j’ai', (await row('avoir', 'PRESENT'))[0])).toBe('correct');
    expect(checkAnswer('que je fasse', (await row('faire', 'SUBJONCTIF_PRESENT'))[0])).toBe('correct');
    expect(checkAnswer('fasse', (await row('faire', 'SUBJONCTIF_PRESENT'))[0])).toBe('correct');
  });
});
