import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  correctTypo,
  validateAnswer,
  answerRule,
  answerWeight,
  answerEntries,
  answerVariants,
  scoreAnswer,
  seededShuffle,
  rarityLabel,
  wrongLabel,
  MAX_ANSWER_ATTEMPTS,
} from '../src/lib/scoring.js';
import { QUESTIONS } from '../src/data/questions.js';

const question = {
  id: 'test-1',
  prompt: 'Noem iets dat je kunt opblazen.',
  common: ['ballon', 'luchtballon'],
  rare: ['een gerucht', 'de wereld'],
};

// Losse variant om de typo-correctie rechtstreeks tegen een lijstantwoord te testen.
const typoQuestion = {
  id: 'test-typo',
  prompt: 'Noem een gerucht.',
  common: ['ballon'],
  rare: ['gerucht'],
};

// Vraag met aanvullende regelvelden; die worden ná de herkenning gecontroleerd.
const ruleQuestion = {
  id: 'test-rule',
  prompt: 'Noem een voertuig.',
  common: ['de auto'],
  rare: ['de oude auto'],
  rule: {
    kind: 'listed',
    hint: 'Antwoord moet met "de" beginnen en uit minimaal twee woorden bestaan.',
    startsWith: 'de',
    minWords: 2,
  },
};

const RANGES = {
  common: [8, 24],
  uncommon: [28, 49],
  rare: [58, 82],
  ghost: [84, 100],
};

test('normalize strips diacritics and punctuation', () => {
  assert.equal(normalize('  Café--Boom!  '), 'cafe boom');
  assert.equal(normalize('Straße'), 'strasse');
});

test('typo correction needs a unique unambiguous candidate', () => {
  assert.equal(correctTypo('ballon', question.common), 'ballon');
  assert.equal(correctTypo('balllor', ['ballon', 'ballonnetje']), 'balllor');
  assert.equal(correctTypo('gerucnt', ['gerucht']), 'gerucht');
  assert.equal(correctTypo('een gerucnt', question.rare), 'een gerucht');
});

test('validation rejects junk but accepts short valid answers', () => {
  assert.equal(validateAnswer('', question).ok, false);
  assert.equal(validateAnswer('aaaaaaaaaa', question).reason, 'GIBBERISH');
  assert.equal(validateAnswer('ok', question).ok, true);
});

test('elk antwoord heeft een eigen gewicht binnen zijn band', () => {
  const seen = new Set();
  for (const [tier, [min, max]] of Object.entries(RANGES)) {
    const values = new Set();
    for (let i = 0; i < 60; i += 1) {
      const value = answerWeight(`antwoord-${tier}-${i}`, tier);
      assert.ok(value >= min && value <= max, `${tier}: ${value}`);
      values.add(value);
      seen.add(`${tier}:${value}`);
    }
    assert.ok(values.size >= 10, `band ${tier} heeft te weinig verschillende waarden`);
  }
  assert.ok(seen.size >= 70, 'te weinig verschillende puntwaarden');
  assert.ok(RANGES.common[1] < RANGES.uncommon[0]);
  assert.ok(RANGES.uncommon[1] < RANGES.rare[0]);
  assert.ok(RANGES.rare[1] < RANGES.ghost[0]);
  assert.equal(rarityLabel(10).key, 'common');
  assert.equal(rarityLabel(35).key, 'uncommon');
  assert.equal(rarityLabel(70).key, 'rare');
  assert.equal(rarityLabel(90).key, 'ghost');
});

test('common/rare krijgen hun band en echo blijft −10', () => {
  const common = scoreAnswer({ raw: 'ballon', question, peerAnswers: [] });
  const rare = scoreAnswer({ raw: 'een gerucht', question, peerAnswers: [] });
  assert.equal(common.wrong, false);
  assert.equal(common.tier, 'common');
  assert.ok(common.points >= 8 && common.points <= 24);
  assert.equal(rare.wrong, false);
  assert.equal(rare.tier, 'rare');
  assert.ok(rare.points >= 58 && rare.points <= 82);

  const duplicate = scoreAnswer({ raw: 'een gerucht', question, peerAnswers: ['een gerucht'] });
  assert.equal(rare.points - duplicate.points, 10);
  assert.match(duplicate.notes.join(' '), /ECHO/);
});

test('onbekende antwoorden zijn écht fout: 0 punten en geen pseudo-rarity', () => {
  const first = scoreAnswer({ raw: 'een rare spinazie', question, peerAnswers: [] });
  const second = scoreAnswer({ raw: 'een rare spinazie', question, peerAnswers: [] });

  assert.deepEqual(first, second);
  assert.equal(first.ok, false);
  assert.equal(first.wrong, true);
  assert.equal(first.reason, 'NOT_IN_LIST');
  assert.equal(first.points, 0);
  assert.equal(first.normalized, 'een rare spinazie');
  assert.equal(first.corrected, null);
  assert.equal(first.notes[0], 'ANTWOORD NIET IN LIJST');
  assert.equal(first.label.key, 'wrong');
  assert.equal(first.label.label, 'Fout');
  assert.ok(!first.notes.some((note) => /SOLO|SPECIFIC|DEEP|GHOST/.test(note)));

  const withPeers = scoreAnswer({ raw: 'een rare spinazie', question, peerAnswers: ['ballon'] });
  assert.equal(withPeers.points, 0);
  assert.equal(withPeers.wrong, true);
  assert.ok(!withPeers.notes.includes('SOLO IN ROOM +18'));
});

test('typo’s en schrijfvormen worden naar het bedoelde antwoord hersteld', () => {
  const los = scoreAnswer({ raw: 'gerucnt', question: typoQuestion });
  assert.equal(los.normalized, 'gerucht');
  assert.equal(los.corrected, 'gerucht');
  assert.ok(los.points >= 55 && los.points <= 82);

  const metLidwoord = scoreAnswer({ raw: 'een gerucnt', question });
  assert.equal(metLidwoord.normalized, 'een gerucht');
  assert.equal(metLidwoord.points >= 55, true);

  const meervoud = scoreAnswer({ raw: 'balloons', question: { ...typoQuestion, answers: [{ text: 'balloon', tier: 'common', points: 12 }] } });
  assert.equal(meervoud.wrong, false);
  assert.equal(meervoud.normalized, 'balloon');

  const alreadyRight = scoreAnswer({ raw: 'gerucht', question: typoQuestion });
  assert.equal(alreadyRight.corrected, null);
});

test('aanvullende regelvelden maken een herkend antwoord alsnog fout', () => {
  const valid = scoreAnswer({ raw: 'de auto', question: ruleQuestion });
  assert.equal(valid.ok, true);
  assert.ok(valid.points > 0);

  const startsWrong = scoreAnswer({ raw: 'auto', question: ruleQuestion });
  assert.equal(startsWrong.wrong, true);
  assert.equal(startsWrong.reason, 'WRONG_START');
  assert.equal(startsWrong.points, 0);

  const tooShort = scoreAnswer({ raw: 'de', question: ruleQuestion });
  assert.equal(tooShort.wrong, true);
  assert.equal(tooShort.reason, 'TOO_SHORT');
  assert.equal(tooShort.points, 0);

  const containsQuestion = {
    ...ruleQuestion,
    rule: { ...ruleQuestion.rule, contains: 'oude' },
  };
  const containsWrong = scoreAnswer({ raw: 'de auto', question: containsQuestion });
  assert.equal(containsWrong.wrong, true);
  assert.equal(containsWrong.reason, 'RULE_FAILED');
  assert.equal(containsWrong.points, 0);
  assert.equal(containsWrong.corrected, null);
  assert.ok(containsWrong.notes.includes('REGEL NIET VOLDAAN'));
});

test('validatiefouten krijgen wrong:true, 0 punten en hetzelfde rode label', () => {
  const cases = [
    ['', 'EMPTY'],
    ['aaaaaaaaaa', 'GIBBERISH'],
    ['https://voorbeeld.nl', 'NO_LINKS'],
  ];
  for (const [raw, reason] of cases) {
    const result = scoreAnswer({ raw, question });
    assert.equal(result.ok, false);
    assert.equal(result.wrong, true);
    assert.equal(result.reason, reason);
    assert.equal(result.points, 0);
    assert.deepEqual(result.label, wrongLabel());
    assert.equal(result.label.label, 'Fout');
  }
});

test('elke vraag heeft een groot, uniek en gewogen antwoordregister', () => {
  assert.ok(QUESTIONS.length > 0);
  for (const item of QUESTIONS) {
    assert.ok(item.rule, `vraag ${item.id} heeft geen rule`);
    assert.equal(item.rule.kind, 'listed', `vraag ${item.id} heeft een onverwacht regeltype`);
    assert.ok(typeof item.rule.hint === 'string' && item.rule.hint.length > 10, `vraag ${item.id} heeft geen bruikbare hint`);
    assert.ok(item.rule.categoryHint, `vraag ${item.id} heeft geen sectorhint`);
    assert.ok(item.answers.length >= 90, `vraag ${item.id} heeft maar ${item.answers.length} antwoorden`);
    assert.ok(item.common.length >= 20, `vraag ${item.id} heeft maar ${item.common.length} common-antwoorden`);
    assert.ok(item.rare.length >= 25, `vraag ${item.id} heeft maar ${item.rare.length} rare-antwoorden`);
    const keys = item.answers.map((entry) => normalize(entry.text));
    assert.equal(new Set(keys).size, keys.length, `vraag ${item.id} heeft dubbele antwoorden`);
    for (const entry of item.answers) {
      const [min, max] = RANGES[entry.tier] || RANGES.common;
      assert.ok(entry.points >= min && entry.points <= max, `vraag ${item.id}: ${entry.text} → ${entry.points}`);
    }
  }
  assert.equal(MAX_ANSWER_ATTEMPTS, 4);
});

test('elk registerantwoord en elke basisvariant wordt geaccepteerd', () => {
  for (const item of QUESTIONS) {
    for (const entry of answerEntries(item)) {
      const result = scoreAnswer({ raw: entry.text, question: item, peerAnswers: [] });
      assert.equal(result.wrong, false, `vraag ${item.id}: "${entry.text}" → ${result.reason}`);
      assert.ok(result.points > 0, `vraag ${item.id}: "${entry.text}" gaf 0 punten`);
    }
    const probe = answerEntries(item).find((entry) => !/^(een|de|het|the|a|an)\b/.test(entry.text));
    if (!probe) continue;
    const variant = answerVariants(probe.text).find((form) => form !== normalize(probe.text));
    if (!variant) continue;
    const result = scoreAnswer({ raw: variant, question: item, peerAnswers: [] });
    assert.equal(result.wrong, false, `vraag ${item.id}: variant "${variant}" → ${result.reason}`);
  }
  assert.equal(answerRule({ category: 'SIGNAL' }).kind, 'listed');
  assert.ok(answerRule({ category: 'SIGNAL' }).categoryHint);
  assert.equal(answerRule({ rule: { kind: 'custom', hint: 'Eigen regel' } }).kind, 'custom');
});

test('seeded shuffle is reproducible', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(seededShuffle(input, 'dag-1'), seededShuffle(input, 'dag-1'));
  assert.notDeepEqual(seededShuffle(input, 'dag-1'), seededShuffle(input, 'dag-2'));
});
