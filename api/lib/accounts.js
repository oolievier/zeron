// Accountlaag voor ZERON: registratie, e-mailverificatie, sessies en statistieken.
// Alle geheimen (wachtwoord, tokens) worden gehasht opgeslagen; alleen
// publicAccount() wordt ooit aan een client teruggegeven.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readJSON, writeJSONConfirmed, removePath } from './store.js';
import { sendVerificationEmail } from './mail.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VERIFY_TTL = DAY;
const SESSION_TTL = 30 * DAY;
const ACCOUNT_PREFIX = 'accounts/';
const SESSION_PREFIX = 'sessions/';
const MAX_HISTORY = 20;

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function nowIso(offset = 0) {
  return new Date(Date.now() + offset).toISOString();
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Constant-time vergelijking van twee hex-hashes met gelijke lengte.
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function normalizeEmail(value) {
  if (typeof value !== 'string') fail(400, 'Vul een geldig e-mailadres in.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    fail(400, 'Vul een geldig e-mailadres in.');
  }
  return email;
}

function normalizeName(value) {
  if (typeof value !== 'string') fail(400, 'Je naam moet 2 tot 18 tekens bevatten.');
  const name = value.trim();
  const length = [...name].length;
  if (length < 2 || length > 18 || /[\u0000-\u001f\u007f]/.test(name)) {
    fail(400, 'Je naam moet 2 tot 18 tekens bevatten.');
  }
  return name;
}

function normalizePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    fail(400, 'Je wachtwoord moet minimaal 8 tekens bevatten.');
  }
  return value;
}

// Vraag aantal mag een getal zijn (bij voorkeur) of een lijst met ids.
function normalizeQuestions(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) fail(400, 'Ongeldig aantal vragen.');
    return Math.min(1000, Math.round(value));
  }
  if (Array.isArray(value)) {
    if (value.length > 100) fail(400, 'Te veel vragen.');
    return value
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .map((item) => (typeof item === 'string' ? item.slice(0, 120) : item))
      .slice(0, 100);
  }
  return fail(400, 'Ongeldig aantal vragen.');
}

function normalizeScore(value) {
  const score = Number(value);
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(score) || score < 0) {
    fail(400, 'Ongeldige score.');
  }
  return Math.min(1_000_000, Math.round(score));
}

function ensureStats(raw) {
  const stats = raw && typeof raw === 'object' ? raw : {};
  const daily = stats.daily && typeof stats.daily === 'object' ? stats.daily : {};
  return {
    plays: Number.isFinite(stats.plays) ? stats.plays : 0,
    best: Number.isFinite(stats.best) ? stats.best : 0,
    streak: Number.isFinite(stats.streak) ? stats.streak : 0,
    history: Array.isArray(stats.history) ? stats.history.slice(-MAX_HISTORY) : [],
    daily: {
      date: typeof daily.date === 'string' ? daily.date : null,
      score: Number.isFinite(daily.score) ? daily.score : 0,
    },
  };
}

function accountPath(key) {
  return `${ACCOUNT_PREFIX}${key}.json`;
}

function sessionPath(tokenHash) {
  return `${SESSION_PREFIX}${tokenHash}.json`;
}

// Enige publieke projectie: nooit passwordHash, salt of verificatiehashes.
export function publicAccount(account, key) {
  return {
    id: key || sha256(account.email),
    email: account.email,
    name: account.name,
    verified: !!account.verified,
    stats: ensureStats(account.stats),
    createdAt: account.createdAt || null,
  };
}

function verifyToken(key) {
  return `${key}.${randomBytes(24).toString('hex')}`;
}

export async function createSession(key) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = nowIso(SESSION_TTL);
  await writeJSONConfirmed(sessionPath(sha256(token)), {
    accountKey: key,
    createdAt: nowIso(),
    expiresAt,
    version: 1,
  });
  return { token, expiresAt };
}

// Geeft interne accountgegevens terug; alleen voor server-side gebruik.
export async function getSessionAccount(token) {
  if (typeof token !== 'string' || !token.trim()) fail(401, 'Geen geldige sessie.');
  const session = await readJSON(sessionPath(sha256(token.trim())));
  if (!session || !Date.parse(session.expiresAt || '') || Date.parse(session.expiresAt) <= Date.now()) {
    fail(401, 'Sessie verlopen of ongeldig.');
  }
  const key = session.accountKey;
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) fail(401, 'Geen geldige sessie.');
  const account = await readJSON(accountPath(key));
  if (!account) fail(401, 'Geen geldige sessie.');
  return { account, key };
}

export async function registerAccount(payload = {}) {
  const email = normalizeEmail(payload.email);
  const name = normalizeName(payload.name);
  const password = normalizePassword(payload.password);
  const key = sha256(email);

  if (await readJSON(accountPath(key))) fail(409, 'Dit e-mailadres is al geregistreerd.');

  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, salt, 64).toString('hex');
  const token = verifyToken(key);
  const account = {
    email,
    name,
    passwordHash,
    salt,
    verified: false,
    stats: ensureStats(),
    createdAt: nowIso(),
    verifyTokenHash: sha256(token),
    verifyExpiresAt: nowIso(VERIFY_TTL),
  };
  account.version = (Number(account.version) || 0) + 1;
  await writeJSONConfirmed(accountPath(key), account);

  const verification = await sendVerificationEmail({ email, token });
  return { account: publicAccount(account, key), verification };
}

export async function verifyAccount(token) {
  if (typeof token !== 'string' || !token.trim()) fail(400, 'Verificatietoken ontbreekt.');
  const match = /^([a-f0-9]{64})\.([a-f0-9]{48})$/.exec(token.trim());
  if (!match) fail(403, 'Ongeldig verificatietoken.');

  const key = match[1];
  const account = await readJSON(accountPath(key));
  if (!account || !account.verifyTokenHash || !safeEqualHex(sha256(token.trim()), account.verifyTokenHash)) {
    fail(403, 'Ongeldig verificatietoken.');
  }
  if (!account.verifyExpiresAt || Date.parse(account.verifyExpiresAt) <= Date.now()) {
    fail(403, 'Dit verificatietoken is verlopen. Vraag een nieuwe aan.');
  }

  account.verified = true;
  account.verifyTokenHash = null;
  account.verifyExpiresAt = null;
  account.version = (Number(account.version) || 0) + 1;
  await writeJSONConfirmed(accountPath(key), account);

  const session = await createSession(key);
  return {
    account: publicAccount(account, key),
    session: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}

export async function resendVerification(payload = {}) {
  const email = normalizeEmail(payload.email);
  const key = sha256(email);
  const account = await readJSON(accountPath(key));

  // Geen account of al geverifieerd: identieke, info-arme response (geen user enumeration).
  if (!account || account.verified) {
    return { verification: { sent: false }, message: 'Controleer je e-mailadres.' };
  }

  const token = verifyToken(key);
  account.verifyTokenHash = sha256(token);
  account.verifyExpiresAt = nowIso(VERIFY_TTL);
  account.version = (Number(account.version) || 0) + 1;
  await writeJSONConfirmed(accountPath(key), account);

  const verification = await sendVerificationEmail({ email, token });
  return {
    verification,
    message: verification.sent
      ? 'We hebben een nieuwe verificatiemail gestuurd.'
      : 'Gebruik de knop hieronder om je account te bevestigen.',
  };
}

export async function loginAccount(payload = {}) {
  const email = normalizeEmail(payload.email);
  const password = normalizePassword(payload.password);
  const key = sha256(email);
  const account = await readJSON(accountPath(key));
  if (!account) fail(401, 'Onjuiste e-mail of wachtwoord.');

  const expected = account.passwordHash;
  const actual = scryptSync(password, account.salt, 64).toString('hex');
  if (!safeEqualHex(actual, expected)) fail(401, 'Onjuiste e-mail of wachtwoord.');
  if (!account.verified) fail(403, 'Bevestig eerst je e-mailadres.');

  const session = await createSession(key);
  return {
    account: publicAccount(account, key),
    session: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}

export async function logoutSession(token) {
  if (typeof token !== 'string' || !token.trim()) fail(401, 'Geen geldige sessie.');
  await removePath(sessionPath(sha256(token.trim())));
  return { loggedOut: true };
}

// Accepteert (payload, sessionToken) en (sessionToken, payload).
export async function saveRun(first = {}, second) {
  const payload = first && typeof first === 'object' && !Array.isArray(first)
    ? first
    : (second && typeof second === 'object' ? second : {});
  const sessionToken = typeof first === 'string'
    ? first
    : (typeof second === 'string' ? second : payload.session);
  const { account, key } = await getSessionAccount(sessionToken);
  const score = normalizeScore(payload.score);
  const mode = typeof payload.mode === 'string'
    ? payload.mode.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || 'solo'
    : 'solo';
  const questions = normalizeQuestions(payload.questions);
  const stats = ensureStats(account.stats);

  stats.plays += 1;
  stats.best = Math.max(stats.best, score);
  stats.streak = score >= 400 ? stats.streak + 1 : 0;
  stats.history = [
    ...stats.history,
    { at: nowIso(), score, mode, questions },
  ].slice(-MAX_HISTORY);

  // Daily best: alleen de eerste run van de (UTC-)dag telt.
  const date = nowIso().slice(0, 10);
  if (stats.daily.date !== date) stats.daily = { date, score };

  account.stats = stats;
  account.version = (Number(account.version) || 0) + 1;
  await writeJSONConfirmed(accountPath(key), account);
  return { account: publicAccount(account, key) };
}

// Korte aliases voor andere server-side aanroepers.
export const register = registerAccount;
export const login = loginAccount;
export const verify = verifyAccount;
export const resend = resendVerification;
export const logout = logoutSession;
export const requireSession = getSessionAccount;
