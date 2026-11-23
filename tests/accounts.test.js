import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import handler from '../api/account.js';
import { readJSON } from '../api/lib/store.js';

// Zonder mailprovider geeft de API een devToken mee; dat maakt de flow testbaar.
const mailEnv = ['RESEND_API_KEY', 'ZERON_SMTP_HOST', 'ZERON_SMTP_PORT', 'ZERON_SMTP_USER', 'ZERON_SMTP_PASS', 'ZERON_SMTP_FROM', 'ZERON_SMTP_SECURE'];
const originalMailEnv = Object.fromEntries(mailEnv.map((key) => [key, process.env[key]]));
for (const key of mailEnv) delete process.env[key];
after(() => {
  for (const key of mailEnv) {
    if (originalMailEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalMailEnv[key];
  }
});

function uniqueEmail(label = 'speler') {
  return `${label}-${Date.now()}-${randomBytes(6).toString('hex')}@example.test`;
}

function storedAccount(email) {
  const key = createHash('sha256').update(email).digest('hex');
  return readJSON(`accounts/${key}.json`);
}

function auth(token) {
  return { 'x-zeron-session': token };
}

// Minimale req/res voor de Vercel-stijl handler.
async function call({ method = 'POST', payload = {}, url = '/api/account', headers = {} } = {}) {
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(payload));
    },
  };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      this.raw = chunk;
      this.json = chunk ? JSON.parse(chunk) : null;
    },
  };
  await handler(req, res);
  return { status: res.statusCode, data: res.json };
}

test('registratie → verify → login → me → saveRun → logout', async () => {
  const email = uniqueEmail('flow');
  const password = 'supergeheim123';

  const registered = await call({
    payload: { action: 'register', email, name: 'ZERON_FAN', password },
  });
  assert.equal(registered.status, 200);
  assert.equal(registered.data.ok, true);
  assert.equal(registered.data.account.email, email);
  assert.equal(registered.data.account.verified, false);
  for (const field of ['passwordHash', 'salt', 'verifyTokenHash', 'verifyExpiresAt']) {
    assert.equal(field in registered.data.account, false, `${field} mag niet publiek zijn`);
  }
  assert.equal(registered.data.verification.sent, false);
  const token = registered.data.devToken;
  assert.match(token, /^[a-f0-9]{64}\.[a-f0-9]{48}$/);
  assert.equal(registered.data.devLink, `#/verify/${token}`);

  // Login vóór verificatie mag niet lukken.
  const earlyLogin = await call({ payload: { action: 'login', email, password } });
  assert.equal(earlyLogin.status, 403);
  assert.equal(earlyLogin.data.ok, false);

  // Een token met de juiste vorm maar verkeerde inhoud faalt met 403.
  const wrongToken = `${'0'.repeat(64)}.${'a'.repeat(48)}`;
  const wrong = await call({ payload: { action: 'verify', token: wrongToken } });
  assert.equal(wrong.status, 403);

  const verified = await call({ payload: { action: 'verify', token } });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.account.verified, true);
  assert.match(verified.data.session, /^[A-Za-z0-9_-]{43}$/);
  const verifySession = verified.data.session;
  assert.equal('verifyTokenHash' in verified.data.account, false);

  const login = await call({ payload: { action: 'login', email, password } });
  assert.equal(login.status, 200);
  assert.equal(login.data.account.verified, true);
  const session = login.data.session;

  const meHeader = await call({ method: 'GET', url: '/api/account?action=me', headers: auth(session) });
  assert.equal(meHeader.status, 200);
  assert.equal(meHeader.data.account.name, 'ZERON_FAN');
  assert.equal('passwordHash' in meHeader.data.account, false);

  // body.session moet ook werken.
  const meBody = await call({ payload: { action: 'me', session } });
  assert.equal(meBody.status, 200);

  const meMissing = await call({ method: 'GET', url: '/api/account?action=me' });
  assert.equal(meMissing.status, 401);
  const meInvalid = await call({ method: 'GET', url: '/api/account?action=me', headers: auth('ongeldig') });
  assert.equal(meInvalid.status, 401);

  const first = await call({
    payload: { action: 'saveRun', session, score: 420, mode: 'solo', questions: 5 },
  });
  assert.equal(first.status, 200);
  const firstStats = first.data.account.stats;
  assert.equal(firstStats.plays, 1);
  assert.equal(firstStats.best, 420);
  assert.equal(firstStats.streak, 1);
  assert.equal(firstStats.history.length, 1);
  assert.equal(firstStats.history[0].score, 420);
  assert.equal(firstStats.history[0].mode, 'solo');
  assert.equal(firstStats.history[0].questions, 5);
  assert.match(firstStats.daily.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(firstStats.daily.score, 420);

  // Lagere score: plays omhoog, best behouden, streak terug naar 0, daily behouden.
  const second = await call({
    payload: { action: 'saveRun', session, score: 100, mode: 'party', questions: 3 },
  });
  assert.equal(second.status, 200);
  const secondStats = second.data.account.stats;
  assert.equal(secondStats.plays, 2);
  assert.equal(secondStats.best, 420);
  assert.equal(secondStats.streak, 0);
  assert.equal(secondStats.history.length, 2);
  assert.equal(secondStats.daily.score, 420);

  const logout = await call({ payload: { action: 'logout', session } });
  assert.equal(logout.status, 200);
  const afterLogout = await call({ method: 'GET', url: '/api/account?action=me', headers: auth(session) });
  assert.equal(afterLogout.status, 401);

  // Andere sessies blijven geldig na logout.
  const otherSession = await call({ method: 'GET', url: '/api/account?action=me', headers: auth(verifySession) });
  assert.equal(otherSession.status, 200);
});

test('dubbele e-mail faalt met 409, ook met andere hoofdletters', async () => {
  const email = uniqueEmail('dup');
  const first = await call({
    payload: { action: 'register', email, name: 'EERSTE', password: 'wachtwoord123' },
  });
  assert.equal(first.status, 200);

  const duplicate = await call({
    payload: { action: 'register', email: email.toUpperCase(), name: 'TWEEDE', password: 'wachtwoord456' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.ok, false);

  const unverified = await call({ payload: { action: 'login', email, password: 'wachtwoord123' } });
  assert.equal(unverified.status, 403);
});

test('wachtwoord en tokens staan niet plaintext in het opgeslagen record', async () => {
  const email = uniqueEmail('hash');
  const password = 'nooit-plaintext-987';
  const registered = await call({
    payload: { action: 'register', email, name: 'HASH', password },
  });
  assert.equal(registered.status, 200);

  const record = await storedAccount(email);
  assert.ok(record, 'accountrecord moet bestaan');
  assert.ok(!JSON.stringify(record).includes(password));
  assert.equal('password' in record, false);
  assert.equal('verifyToken' in record, false);
  assert.match(record.passwordHash, /^[a-f0-9]{128}$/);
  assert.match(record.salt, /^[a-f0-9]{32}$/);
  assert.match(record.verifyTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(scryptSync(password, record.salt, 64).toString('hex'), record.passwordHash);
  assert.equal(record.verified, false);
});

test('resend maakt een nieuwe token ongeldig en verbergt account-bestaan', async () => {
  const email = uniqueEmail('resend');
  const registered = await call({
    payload: { action: 'register', email, name: 'HERSTEL', password: 'wachtwoord123' },
  });
  const oldToken = registered.data.devToken;

  const resent = await call({ payload: { action: 'resend', email } });
  assert.equal(resent.status, 200);
  const newToken = resent.data.devToken;
  assert.ok(newToken);
  assert.notEqual(newToken, oldToken);
  assert.equal((await call({ payload: { action: 'verify', token: oldToken } })).status, 403);
  assert.equal((await call({ payload: { action: 'verify', token: newToken } })).status, 200);

  // Al geverifieerd en onbekend e-mailadres leveren geen token op.
  const again = await call({ payload: { action: 'resend', email } });
  assert.equal(again.status, 200);
  assert.equal(again.data.devToken, undefined);
  const unknown = await call({ payload: { action: 'resend', email: uniqueEmail('onbekend') } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.devToken, undefined);
});

test('ongeldige input, onbekende acties en andere methoden', async () => {
  assert.equal((await call({ payload: { action: 'register', email: 'geen-email', name: 'AB', password: 'langgenoeg' } })).status, 400);
  assert.equal((await call({ payload: { action: 'register', email: uniqueEmail('kort'), name: 'A', password: 'langgenoeg' } })).status, 400);
  assert.equal((await call({ payload: { action: 'register', email: uniqueEmail('ww'), name: 'AB', password: 'kort' } })).status, 400);
  assert.equal((await call({ payload: { action: 'onbekend' } })).status, 400);
  assert.equal((await call({ method: 'PUT' })).status, 405);
  assert.equal((await call({ payload: { action: 'saveRun', score: 10 } })).status, 401);
});
