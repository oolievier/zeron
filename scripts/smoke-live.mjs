// Live API smoke test against a deployed ZERON instance.
// Usage: ZERON_URL=https://zeron-one.vercel.app node scripts/smoke-live.mjs
const base = (process.env.ZERON_URL || 'https://zeron-one.vercel.app').replace(/\/$/, '');

async function json(path, options) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const post = (payload) => json('/api/room', { method: 'POST', body: JSON.stringify(payload) });
const stamp = Date.now();

const health = await json('/api/health');
if (health.storage !== 'blob') throw new Error(`Expected blob storage, got ${health.storage}`);
console.log('health OK:', health.questions, 'questions');

const created = await post({ action: 'create', playerId: `smoke-h-${stamp}`, name: 'SMOKE_H', lang: 'nl', categories: [], rounds: 3, seconds: 30 });
const code = created.room.code;
await post({ action: 'join', code, playerId: `smoke-g-${stamp}`, name: 'SMOKE_G' });
const started = await post({ action: 'start', code, playerId: `smoke-h-${stamp}` });
if (started.room.phase !== 'question' || !started.room.question) throw new Error('Room did not start');

await post({ action: 'answer', code, playerId: `smoke-h-${stamp}`, answer: 'ballon' });
await post({ action: 'answer', code, playerId: `smoke-g-${stamp}`, answer: 'een gerucht' });
const hidden = await json(`/api/room?code=${code}&playerId=smoke-g-${stamp}`);
// All players answered, so the server may already have auto-revealed (1.2 s grace).
if (hidden.room.phase === 'question' && Object.keys(hidden.room.answers || {}).length !== 1) {
  throw new Error('Answers leaked before reveal');
}

const revealed = await post({ action: 'reveal', code, playerId: `smoke-h-${stamp}` });
if (revealed.room.phase !== 'reveal' || Object.keys(revealed.room.answers).length !== 2) throw new Error('Reveal failed');
await post({ action: 'next', code, playerId: `smoke-h-${stamp}` });

const submission = await json('/api/questions', {
  method: 'POST',
  body: JSON.stringify({
    prompt: `Live smoke ${stamp}: noem iets onzichtbaars?`,
    category: 'GLITCH', lang: 'nl', common: 'schaduw, stilte', rare: 'een gedachte, de wind', nickname: 'SMOKE', website: '',
  }),
});
console.log('room flow OK:', code, '| submission OK:', submission.id);
