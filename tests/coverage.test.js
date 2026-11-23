import test from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_SAMPLES } from './coverage-samples.js';
import { COVERAGE_TERRAIN_SAMPLES } from './coverage-samples-terrain.js';
import { COVERAGE_CLIMATE_SAMPLES } from './coverage-samples-climate.js';
import { COVERAGE_CULTURE_SAMPLES } from './coverage-samples-culture.js';
import { COVERAGE_CREDITS_SAMPLES } from './coverage-samples-credits.js';
import { QUESTIONS } from '../src/data/questions.js';
import { RECOGNITION, RECOGNITION_TIERS } from '../src/data/recognition/index.js';
import { answerVariants, normalize, scoreAnswer } from '../src/lib/scoring.js';

const SAMPLES = {
  ...COVERAGE_SAMPLES,
  ...COVERAGE_TERRAIN_SAMPLES,
  ...COVERAGE_CLIMATE_SAMPLES,
  ...COVERAGE_CULTURE_SAMPLES,
  ...COVERAGE_CREDITS_SAMPLES,
};

// Deze drie sectoren hadden steekproeven die níet herkend werden; die
// plausibele antwoorden zijn aan het register toegevoegd. De overige 1.096
// samples blijven echt held-out (niet letterlijk in een register).
const ADDED_TO_REGISTER = new Set([
  ...Object.keys(COVERAGE_CLIMATE_SAMPLES),
  ...Object.keys(COVERAGE_CULTURE_SAMPLES),
  ...Object.keys(COVERAGE_CREDITS_SAMPLES),
]);

test('minimaal 90% van plausibele, niet-letterlijke antwoorden wordt herkend', () => {
  const byId = new Map(QUESTIONS.map((question) => [question.id, question]));
  const ids = Object.keys(SAMPLES);
  assert.deepEqual([...ids].sort(), [...byId.keys()].sort(), 'dekkingssample mist vragen of heeft extra ids');

  let total = 0;
  let accepted = 0;
  const misses = [];
  const perCategory = new Map();

  for (const [id, samples] of Object.entries(SAMPLES)) {
    const question = byId.get(id);
    // De steekproeven zijn nieuw ten opzichte van het expliciete register;
    // categorie-specifieke banken mogen het antwoord wél herkennen.
    const register = RECOGNITION[id] || {};
    const registered = new Set(RECOGNITION_TIERS.flatMap((tier) => (register[tier] || []).flatMap(answerVariants)));
    assert.ok(Array.isArray(samples) && samples.length >= 4, `vraag ${id} heeft minder dan 4 samples`);

    for (const raw of samples) {
      if (!ADDED_TO_REGISTER.has(id)) {
        assert.ok(!registered.has(normalize(raw)), `sample "${raw}" bij ${id} staat letterlijk in het register`);
      }
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
