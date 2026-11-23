import test from 'node:test';
import assert from 'node:assert/strict';
import { act, getRoom } from '../api/lib/rooms.js';
import { QUESTIONS } from '../src/data/questions.js';
import { MAX_ANSWER_ATTEMPTS } from '../src/lib/scoring.js';

test('a full room round keeps answers hidden until reveal', async () => {
  const created = await act({
    action: 'create', playerId: 'host', name: 'HOST', lang: 'nl', categories: [], rounds: 3, seconds: 15, seed: 'test-seed',
  });
  assert.ok(created.room.code.match(/^[A-Z0-9]{5}$/));
  const code = created.room.code;
  assert.equal(created.room.phase, 'lobby');
  assert.equal(created.room.totalRounds, 3);

  await act({ action: 'join', code, playerId: 'guest', name: 'GUEST' });
  const started = await act({ action: 'start', code, playerId: 'host' });

  const question = QUESTIONS.find((item) => item.id === started.room.question?.id);
  assert.ok(question, 'started room must expose a question id');
  await act({ action: 'answer', code, playerId: 'host', answer: question.common[0] });
  await act({ action: 'answer', code, playerId: 'guest', answer: question.common[0] });

  const hidden = await getRoom(code, 'guest');
  assert.equal(hidden.room.phase, 'question');
  assert.equal(Object.keys(hidden.room.answers).length, 1);
  assert.equal(hidden.room.answers.guest.text, question.common[0]);

  await act({ action: 'reveal', code, playerId: 'host' });
  const revealed = await getRoom(code, 'guest');
  assert.equal(revealed.room.phase, 'reveal');
  assert.equal(Object.keys(revealed.room.answers).length, 2);
  assert.ok(revealed.room.answers.host.points < 40);

  await act({ action: 'next', code, playerId: 'host' });
  const next = await getRoom(code, 'host');
  assert.equal(next.room.round, 1);
  assert.equal(next.room.phase, 'question');
});

test('a wrong room answer scores zero and keeps the red wrong label', async () => {
  const created = await act({
    action: 'create', playerId: 'solo-host', name: 'SOLO', lang: 'nl', categories: [], rounds: 3, seconds: 15, seed: 'wrong-seed',
  });
  const code = created.room.code;
  await act({ action: 'start', code, playerId: 'solo-host' });
  await act({ action: 'answer', code, playerId: 'solo-host', answer: 'flubberkabouter9000' });
  await act({ action: 'reveal', code, playerId: 'solo-host' });
  const revealed = await getRoom(code, 'solo-host');
  const answer = Object.values(revealed.room.answers)[0];
  assert.equal(answer.points, 0);
  assert.equal(answer.wrong, true);
  assert.equal(answer.label.key, 'wrong');
});

test('a wrong answer grants retries inside the timer instead of ending the round', async () => {
  const created = await act({
    action: 'create', playerId: 'retry-host', name: 'RETRY', lang: 'nl', categories: [], rounds: 3, seconds: 25, seed: 'retry-seed',
  });
  const code = created.room.code;
  const started = await act({ action: 'start', code, playerId: 'retry-host' });
  const originalEnd = started.room.clock.roundEndsAt;

  for (let attempt = 1; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
    const wrong = await act({ action: 'answer', code, playerId: 'retry-host', answer: `fout${attempt}antenna` });
    assert.equal(wrong.room.phase, 'question');
    assert.equal(wrong.room.answers['retry-host'].pending, true);
    assert.equal(wrong.room.answers['retry-host'].accepted, false);
    assert.equal(wrong.room.answers['retry-host'].attemptsUsed, attempt);
    assert.equal(wrong.room.answers['retry-host'].attemptsLeft, MAX_ANSWER_ATTEMPTS - attempt);
    assert.equal(wrong.room.players.find((p) => p.id === 'retry-host').hasAnswered, false);
  }
  assert.equal((await getRoom(code, 'retry-host')).room.clock.roundEndsAt, originalEnd, 'retries must not shorten the clock');

  const last = await act({ action: 'answer', code, playerId: 'retry-host', answer: 'laatstefoutantenna' });
  assert.equal(last.room.answers['retry-host'].final, true);
  assert.equal(last.room.answers['retry-host'].attemptsLeft, 0);
  assert.equal(last.room.players.find((p) => p.id === 'retry-host').hasAnswered, true);

  await act({ action: 'reveal', code, playerId: 'retry-host' });
  const revealed = await getRoom(code, 'retry-host');
  const answer = revealed.room.answers['retry-host'];
  assert.equal(answer.points, 0);
  assert.equal(answer.wrong, true);
  assert.equal(answer.attempts, MAX_ANSWER_ATTEMPTS);
});

test('a correct answer on a later retry is accepted normally', async () => {
  const created = await act({
    action: 'create', playerId: 'late-host', name: 'LATE', lang: 'nl', categories: [], rounds: 3, seconds: 25, seed: 'late-seed',
  });
  const code = created.room.code;
  const started = await act({ action: 'start', code, playerId: 'late-host' });
  const question = QUESTIONS.find((item) => item.id === started.room.question?.id);

  await act({ action: 'answer', code, playerId: 'late-host', answer: 'nietindelijst123' });
  const accepted = await act({ action: 'answer', code, playerId: 'late-host', answer: question.common[0] });
  assert.equal(accepted.room.answers['late-host'].accepted, true);
  assert.equal(accepted.room.answers['late-host'].final, true);
  assert.equal(accepted.room.players.find((p) => p.id === 'late-host').hasAnswered, true);

  await act({ action: 'reveal', code, playerId: 'late-host' });
  const revealed = await getRoom(code, 'late-host');
  assert.equal(revealed.room.answers['late-host'].wrong, false);
  assert.ok(revealed.room.answers['late-host'].points > 0);
  assert.equal(revealed.room.answers['late-host'].attempts, 2);
});

test('only the host can start and unknown rooms fail cleanly', async () => {
  const created = await act({ action: 'create', playerId: 'host', name: 'HOST', lang: 'en', rounds: 3, seconds: 10, categories: [] });
  const result = await act({ action: 'start', code: created.room.code, playerId: 'intruder' });
  assert.equal(result.error, 403);
  const missing = await getRoom('XXXXX', 'host');
  assert.equal(missing.error, 404);
  const snapshot = await getRoom(created.room.code, 'host');
  assert.equal(snapshot.room.code, created.room.code);
});
