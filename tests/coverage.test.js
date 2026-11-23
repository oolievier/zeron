import test from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_SAMPLES } from './coverage-samples.js';
import { QUESTIONS } from '../src/data/questions.js';
import { answerEntries, normalize, scoreAnswer } from '../src/lib/scoring.js';

test('minimaal 90% van plausibele, niet-letterlijke antwoorden wordt herkend', () => {
  const byId = new Map(QUESTIONS.map((question) => [question.id, question]));
  const ids = Object.keys(COVERAGE_SAMPLES);
  assert.deepEqual([...ids].sort(), [...byId.keys()].sort(), 'dekkingssample mist vragen of heeft extra ids');

  let total = 0;
  let accepted = 0;
  const misses = [];
  const perCategory = new Map();

  for (const [id, samples] of Object.entries(COVERAGE_SAMPLES)) {
    const question = byId.get(id);
    const registered = new Set(answerEntries(question).flatMap((entry) => entry.variants));
    assert.ok(Array.isArray(samples) && samples.length >= 4, `vraag ${id} heeft minder dan 4 samples`);

    for (const raw of samples) {
      assert.ok(!registered.has(normalize(raw)), `sample "${raw}" bij ${id} staat letterlijk in het register`);
      total += 1;
      const result = scoreAnswer({ raw, question, peerAnswers: [] });
      const category = question.category;
      const stats = perCategory.get(category) || { total: 0, accepted: 0 };
      stats.total += 1;
      if (result.wrong) {
        misses.push(`${id}: "${raw}" → ${result.reason}`);
      } else {
        accepted += 1;
        stats.accepted += 1;
      }
      perCategory.set(category, stats);
    }
  }

  const rate = accepted / total;
  const summary = [...perCategory.entries()]
    .map(([category, stats]) => `${category} ${stats.accepted}/${stats.total} (${Math.round(stats.accepted / stats.total * 100)}%)`)
    .join(' | ');
  console.log(`coverage: ${accepted}/${total} = ${(rate * 100).toFixed(1)}% — ${summary}`);

  assert.ok(rate >= 0.9, `dekking ${(rate * 100).toFixed(1)}% < 90%; voorbeelden: ${misses.slice(0, 25).join(', ')}`);
});
