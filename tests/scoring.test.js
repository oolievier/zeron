import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, correctTypo, validateAnswer, scoreAnswer, seededShuffle, rarityLabel } from '../src/lib/scoring.js';

const question = {
  id: 'test-1',
  prompt: 'Noem iets dat je kunt opblazen.',
  common: ['ballon', 'luchtballon'],
  rare: ['een gerucht', 'de wereld'],
};

test('normalize strips diacritics and punctuation', () => {
  assert.equal(normalize('  Café--Boom!  '), 'cafe boom');
  assert.equal(normalize('Straße'), 'strasse');
});

test('typo correction needs a unique unambiguous candidate', () => {
  assert.equal(correctTypo('ballon', question.common), 'ballon');
  assert.equal(correctTypo('balllor', ['ballon', 'ballonnetje']), 'balllor');
  assert.equal(correctTypo('gerucnt', ['gerucht']), 'gerucht');
});

test('validation rejects junk but accepts short valid answers', () => {
  assert.equal(validateAnswer('', question).ok, false);
  assert.equal(validateAnswer('aaaaaaaaaa', question).reason, 'GIBBERISH');
  assert.equal(validateAnswer('ok', question).ok, true);
});

test('rare list beats common list and uniqueness adds points', () => {
  const common = scoreAnswer({ raw: 'ballon', question, peerAnswers: [] });
  const rare = scoreAnswer({ raw: 'een gerucht', question, peerAnswers: [] });
  assert.equal(common.points, 22);
  assert.ok(rare.points >= 82);
  assert.equal(rare.label.key, 'ghost');

  const duplicate = scoreAnswer({ raw: 'een gerucht', question, peerAnswers: ['een gerucht'] });
  assert.ok(duplicate.points < rare.points);
  assert.match(duplicate.notes.join(' '), /ECHO/);
});

test('pseudo rarity is deterministic and bounded', () => {
  const first = scoreAnswer({ raw: 'een rare spinazie', question, peerAnswers: [] });
  const second = scoreAnswer({ raw: 'een rare spinazie', question, peerAnswers: [] });
  assert.equal(first.points, second.points);
  assert.ok(first.points >= 5 && first.points <= 100);
  assert.ok(rarityLabel(10).key === 'common');
});

test('seeded shuffle is reproducible', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(seededShuffle(input, 'dag-1'), seededShuffle(input, 'dag-1'));
  assert.notDeepEqual(seededShuffle(input, 'dag-1'), seededShuffle(input, 'dag-2'));
});
