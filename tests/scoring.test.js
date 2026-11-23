import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  correctTypo,
  validateAnswer,
  answerRule,
  scoreAnswer,
  seededShuffle,
  rarityLabel,
  wrongLabel,
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

// Vraag met aanvullende regelvelden; die moeten ná de lijstcontrole worden gecontroleerd.
const ruleQuestion = {
  id: 'test-rule',
  prompt: 'Noem een voertuig.',
  common: ['de auto'],
  rare: ['de oude auto'],
  rule: {
    kind: 'listed',
    hint: 'Antwoord moet in de lijst staan en met "de" beginnen.',
    startsWith: 'de',
    minWords: 2,
  },
};

test('normalize strips diacritics and punctuation', () => {
  assert.equal(normalize('  Café--Boom!  '), 'cafe boom');
  assert.equal(normalize('Straße'), 'strasse');
});

test('typo correction needs a unique unambiguous candidate', () => {
  assert.equal(correctTypo('ballon', question.common), 'ballon');
  assert.equal(correctTypo('balllor', ['ballon', 'ballonnetje']), 'balllor');
  assert.equal(correctTypo('gerucnt', ['gerucht']), 'gerucht');
  // Woorden uit meerwoordige lijstantwoorden zijn ook geldige correctiebronnen.
  assert.equal(correctTypo('een gerucnt', question.rare), 'een gerucht');
});

test('validation rejects junk but accepts short valid answers', () => {
  assert.equal(validateAnswer('', question).ok, false);
  assert.equal(validateAnswer('aaaaaaaaaa', question).reason, 'GIBBERISH');
  assert.equal(validateAnswer('ok', question).ok, true);
});

test('common/rare behouden hun scores en echo blijft −10', () => {
  const common = scoreAnswer({ raw: 'ballon', question, peerAnswers: [] });
  const rare = scoreAnswer({ raw: 'een gerucht', question, peerAnswers: [] });
  assert.equal(common.points, 22);
  assert.equal(common.wrong, false);
  assert.ok(rare.points >= 82);
  assert.ok(rare.notes.includes('RARE LIST'));
  assert.equal(rare.label.key, 'ghost');
  assert.equal(rarityLabel(10).key, 'common');

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
  assert.ok(!first.notes.some((note) => /LIST|SOLO|SPECIFIC|DEEP|NEAR MISS/.test(note) && note !== 'ANTWOORD NIET IN LIJST'));

  // Ook met medespelers mag een onbekend antwoord geen bonus krijgen.
  const withPeers = scoreAnswer({ raw: 'een rare spinazie', question, peerAnswers: ['ballon'] });
  assert.equal(withPeers.points, 0);
  assert.equal(withPeers.wrong, true);
  assert.ok(!withPeers.notes.includes('SOLO IN ROOM +18'));
});

test('typo-correctie naar een lijstantwoord scoort als rare', () => {
  const los = scoreAnswer({ raw: 'gerucnt', question: typoQuestion });
  assert.equal(los.normalized, 'gerucht');
  assert.equal(los.corrected, 'gerucht');
  assert.equal(los.points, 82);
  assert.ok(los.notes.includes('RARE LIST'));

  const metLidwoord = scoreAnswer({ raw: 'een gerucnt', question });
  assert.equal(metLidwoord.normalized, 'een gerucht');
  assert.equal(metLidwoord.corrected, 'een gerucht');
  assert.ok(metLidwoord.points >= 82);

  // Zonder daadwerkelijke correctie blijft `corrected` null.
  const alreadyRight = scoreAnswer({ raw: 'gerucht', question: typoQuestion });
  assert.equal(alreadyRight.corrected, null);
});

test('aanvullende regelvelden maken een lijstantwoord alsnog fout', () => {
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

test('elke vraag in QUESTIONS heeft een listed-regel met hint', () => {
  assert.ok(QUESTIONS.length > 0);
  for (const item of QUESTIONS) {
    assert.ok(item.rule, `vraag ${item.id} heeft geen rule`);
    assert.equal(item.rule.kind, 'listed', `vraag ${item.id} heeft een onverwacht regeltype`);
    assert.ok(typeof item.rule.hint === 'string' && item.rule.hint.length > 10, `vraag ${item.id} heeft geen bruikbare hint`);
    assert.ok(item.rule.categoryHint, `vraag ${item.id} heeft geen sectorhint`);
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
