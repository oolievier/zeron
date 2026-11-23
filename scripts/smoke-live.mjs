// Live API smoke test against a deployed ZERON instance.
// Usage: ZERON_URL=https://zeron-one.vercel.app node scripts/smoke-live.mjs
import { QUESTIONS } from '../src/data/questions.js';

const base = (process.env.ZERON_URL || 'https://zeron-one.vercel.app').replace(/\/$/, '');

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

// Blob heeft soms een korte read-after-write-latentie tussen functie-instanties.
async function eventually(path, options = {}, check = () => true, attempts = 8) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const data = await json(path, options);
      if (check(data)) return data;
      lastError = new Error(`${path}: voorwaarde nog niet waar`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw lastError;
}

const post = (payload) => json('/api/room', { method: 'POST', body: JSON.stringify(payload) });
const postAccount = (payload, headers) => json('/api/account', {
  method: 'POST', body: JSON.stringify(payload), headers,
});
const stamp = Date.now();

const health = await json('/api/health');
if (health.storage !== 'blob') throw new Error(`Expected blob storage, got ${health.storage}`);
console.log('health OK:', health.questions, 'questions');

const hostId = `smoke-h-${stamp}`;
const guestId = `smoke-g-${stamp}`;
const created = await post({ action: 'create', playerId: hostId, name: 'SMOKE_H', lang: 'nl', categories: [], rounds: 3, seconds: 30 });
const code = created.room.code;
await post({ action: 'join', code, playerId: guestId, name: 'SMOKE_G' });
const started = await post({ action: 'start', code, playerId: hostId });
if (started.room.phase !== 'question' || !started.room.question) throw new Error('Room did not start');

// Kies een lijstantwoord van de echte vraag, zodat de score-asserties betekenis hebben.
const source = QUESTIONS.find((item) => item.id === started.room.question.id);
await post({ action: 'answer', code, playerId: hostId, answer: source ? source.common[0] : 'ballon' });
// Eén fout antwoord mag de ronde niet sluiten: de speler houdt pogingen over.
for (let attempt = 1; attempt <= 3; attempt++) {
  const retry = await post({ action: 'answer', code, playerId: guestId, answer: `foutpoging${attempt}xyz` });
  const own = retry.room.answers[guestId];
  if (retry.room.phase !== 'question' || own?.pending !== true || own?.attemptsLeft !== 4 - attempt) {
    throw new Error(`Retry failed: ${JSON.stringify(own)}`);
  }
}
console.log('retries OK: 3 wrong attempts kept the round open');

const hidden = await json(`/api/room?code=${code}&playerId=${guestId}`);
// De server mag al auto-revealen (1,2 s), maar vóór de reveal mag nooit een
// antwoord van een andere speler zichtbaar zijn.
const leaked = Object.keys(hidden.room.answers || {}).some((id) => id !== guestId);
if (leaked) throw new Error('Answers leaked before reveal');

const revealed = await post({ action: 'reveal', code, playerId: hostId });
if (revealed.room.phase !== 'reveal' || Object.keys(revealed.room.answers).length !== 2) {
  throw new Error(`Reveal failed: phase=${revealed.room.phase} v=${revealed.room.version} answers=${JSON.stringify(Object.keys(revealed.room.answers || {}))}`);
}
const good = revealed.room.answers[hostId];
const bad = revealed.room.answers[guestId];
if (source && !(good.points > 0)) throw new Error(`Listed answer scored ${good.points}`);
if (!bad.wrong || bad.points !== 0 || bad.label?.key !== 'wrong') throw new Error('Wrong answer was not scored as wrong');
console.log('scoring OK:', good.points, 'vs', bad.points, bad.label?.label);
await post({ action: 'next', code, playerId: hostId });

// Accountflow. Met een directe link doen we de hele flow; met echte mail
// checken we dat de provider accepteert (de token zit dan in de inbox).
const email = `smoke-${stamp}@gmail.com`;
const registration = await postAccount({ action: 'register', email, name: 'SMOKE', password: 'smokepass99' });

if (registration.devLink) {
  const token = registration.devLink.split('/').pop();
  const verified = await postAccount({ action: 'verify', token });
  if (!verified.session || !verified.account?.verified) throw new Error('Verification failed');
  const sessionHeaders = { 'X-Zeron-Session': verified.session };
  await eventually('/api/account?action=me', { headers: sessionHeaders }, (data) => data.account?.email === email);
  const saved = await eventually('/api/account', {
    method: 'POST', body: JSON.stringify({ action: 'saveRun', score: 512, mode: 'blitz', questions: 7 }), headers: sessionHeaders,
  }, (data) => data.account?.stats?.plays >= 1 && data.account?.stats?.best >= 512);
  if (saved.account.stats.plays < 1 || saved.account.stats.best < 512) throw new Error('saveRun failed');
  await postAccount({ action: 'logout' }, sessionHeaders);
  console.log('account flow OK (directe link):', email);
} else if (registration.verification?.sent) {
  const resent = await postAccount({ action: 'resend', email });
  if (!resent.verification?.sent) throw new Error('Verification mail could not be resent');
  console.log('account mail OK:', registration.verification.provider, '| link staat in de inbox:', email);
} else {
  throw new Error(`No verification route returned: ${JSON.stringify(registration.verification)}`);
}

const submission = await json('/api/questions', {
  method: 'POST',
  body: JSON.stringify({
    prompt: `Live smoke ${stamp}: noem iets onzichtbaars?`,
    category: 'GLITCH', lang: 'nl', common: 'schaduw, stilte', rare: 'een gedachte, de wind', nickname: 'SMOKE', website: '',
  }),
});
console.log('room flow OK:', code, '| submission OK:', submission.id);
