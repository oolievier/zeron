import test from 'node:test';
import assert from 'node:assert/strict';
import { act, getRoom } from '../api/lib/rooms.js';
import { QUESTIONS } from '../src/data/questions.js';

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

test('only the host can start and unknown rooms fail cleanly', async () => {
  const created = await act({ action: 'create', playerId: 'host', name: 'HOST', lang: 'en', rounds: 3, seconds: 10, categories: [] });
  const result = await act({ action: 'start', code: created.room.code, playerId: 'intruder' });
  assert.equal(result.error, 403);
  const missing = await getRoom('XXXXX', 'host');
  assert.equal(missing.error, 404);
  const snapshot = await getRoom(created.room.code, 'host');
  assert.equal(snapshot.room.code, created.room.code);
});
