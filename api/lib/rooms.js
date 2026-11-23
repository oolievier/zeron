import { QUESTIONS } from '../../src/data/questions.js';
import { expandQuestion } from '../../src/data/answer-banks.js';
import { normalize, scoreAnswer, seededShuffle, wrongLabel, MAX_ANSWER_ATTEMPTS } from '../../src/lib/scoring.js';
import { readJSON, writeJSONConfirmed, listPaths } from './store.js';

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3479';
const MAX_PLAYERS = 8;

function roomPath(code) {
  return `rooms/${code}.json`;
}

function makeCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

function cleanName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 18);
}

async function communityQuestions() {
  const paths = await listPaths('community/');
  const items = await Promise.all(paths.map((path) => readJSON(path).catch(() => null)));
  return items
    .filter((item) => item?.status === 'live' && item.question?.prompt)
    .map((item) => expandQuestion(item.question));
}

function allQuestions(community = []) {
  return [...QUESTIONS, ...community];
}

function chooseQuestions(settings, community) {
  const pool = allQuestions(community).filter((question) => {
    if (settings.lang !== 'all' && question.lang !== settings.lang) return false;
    if (settings.categories?.length && !settings.categories.includes(question.category)) return false;
    return true;
  });
  const source = pool.length >= settings.rounds ? pool : allQuestions(community);
  return seededShuffle(source, settings.seed).slice(0, settings.rounds).map((question) => question.id);
}

function findQuestion(room) {
  const id = room.questionIds[room.round];
  return allQuestions(room.community || []).find((question) => question.id === id) || null;
}

function publicQuestion(question) {
  if (!question) return null;
  return {
    id: question.id,
    prompt: question.prompt,
    category: question.category,
    lang: question.lang,
    tags: question.tags || [],
    rule: question.rule || null,
  };
}

function finalizeRound(room, now) {
  const question = findQuestion(room);
  const stored = room.roundAnswers?.[room.round] || {};
  // Alleen geaccepteerde antwoorden tellen als peers voor de echo-bonus.
  const acceptedTexts = room.players
    .map((player) => stored[player.id])
    .filter((entry) => entry?.accepted)
    .map((entry) => normalize(entry.text));
  const historyEntry = {
    questionId: question?.id || null,
    question: publicQuestion(question),
    answers: {},
    at: now,
  };

  for (const player of room.players) {
    const entry = stored[player.id];
    const accepted = Boolean(entry?.accepted);
    const text = entry?.text || '';
    const otherPeers = acceptedTexts.filter((_, index) => room.players[index].id !== player.id);
    // Spelers zonder geldig antwoord (timeout of uitgeputte pogingen) krijgen
    // expliciet 0 punten en een rood label — nooit een pseudo-rarity.
    const result = accepted
      ? scoreAnswer({ raw: text, question: question || {}, peerAnswers: otherPeers })
      : {
          ok: false,
          wrong: true,
          points: 0,
          reason: entry?.final ? entry.reason || 'NOT_IN_LIST' : 'TIMEOUT',
          normalized: normalize(text),
          corrected: null,
          label: wrongLabel(),
          notes: entry?.final ? ['ANTWOORD NIET IN LIJST', 'POGINGEN UITGEPUT'] : ['CLOCK EXPIRED'],
          duplicateCount: 0,
        };
    player.score += result.points;
    player.streak = result.points >= 75 ? player.streak + 1 : 0;
    historyEntry.answers[player.id] = {
      text: text || (room.settings.lang === 'en' ? 'NO ANSWER' : 'GEEN ANTWOORD'),
      normalized: result.normalized,
      corrected: result.corrected,
      points: result.points,
      label: result.label,
      wrong: Boolean(result.wrong),
      notes: result.notes || [],
      reason: result.reason || null,
      attempts: entry?.attempts?.length || 0,
    };
  }

  room.history[room.round] = historyEntry;
  room.phase = 'reveal';
  room.revealUntil = now + 7000;
  room.roundAnswers[room.round] = {};
}

function nextRound(room, now) {
  if (room.round + 1 >= room.questionIds.length) {
    room.phase = 'finished';
    room.endedAt = now;
    return;
  }
  room.round += 1;
  room.phase = 'question';
  room.history[room.round] = null;
  room.roundAnswers[room.round] = {};
  room.roundStartsAt = now;
  room.roundEndsAt = now + room.settings.seconds * 1000;
  room.revealUntil = null;
}

// Server-clock transitions; called on every read/write so the host cannot stall a round.
function advance(room, now = Date.now()) {
  let changed = false;
  if (room.phase === 'question' && now >= room.roundEndsAt) {
    finalizeRound(room, now);
    changed = true;
  }
  if (room.phase === 'reveal' && now >= room.revealUntil) {
    nextRound(room, now);
    changed = true;
  }
  return changed;
}

async function withRoom(code, mutator, playerId) {
  const path = roomPath(code);
  for (let attempt = 0; attempt < 4; attempt++) {
    const room = await readJSON(path);
    if (!room) return { error: 404, message: 'Kamer niet gevonden.' };
    const version = room.version;
    const now = Date.now();
    const changed = advance(room, now);
    const outcome = mutator(room, now);
    if (outcome?.error) return outcome;
    if (changed || outcome?.write !== false) {
      room.version = version + 1;
      room.updatedAt = now;
      await writeJSONConfirmed(path, room);
    }
    return { room: publicRoom(room, playerId) };
  }
  return { error: 409, message: 'Kamer is druk. Probeer opnieuw.' };
}

export async function createRoom(payload) {
  const settings = {
    lang: ['nl', 'en', 'all'].includes(payload.lang) ? payload.lang : 'nl',
    categories: Array.isArray(payload.categories) && payload.categories.length ? payload.categories.slice(0, 8) : [],
    rounds: Math.min(15, Math.max(3, Number(payload.rounds) || 7)),
    seconds: Math.min(60, Math.max(10, Number(payload.seconds) || 25)),
    seed: String(payload.seed || `${Date.now()}-${Math.random()}`),
    mode: payload.mode === 'daily' ? 'daily' : 'random',
  };
  const community = await communityQuestions();
  const room = {
    code: makeCode(),
    hostId: String(payload.playerId || crypto.randomUUID()),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    settings,
    community,
    questionIds: chooseQuestions(settings, community),
    players: [],
    phase: 'lobby',
    round: 0,
    roundStartsAt: null,
    roundEndsAt: null,
    revealUntil: null,
    roundAnswers: {},
    history: {},
    endedAt: null,
  };
  const name = cleanName(payload.name) || 'HOST';
  room.players.push({ id: room.hostId, name, score: 0, streak: 0, joinedAt: Date.now(), lastSeen: Date.now() });
  await writeJSONConfirmed(roomPath(room.code), room);
  return { room: publicRoom(room, room.hostId) };
}

export async function getRoom(code, playerId) {
  const path = roomPath(code);
  const room = await readJSON(path);
  if (!room) return { error: 404, message: 'Kamer niet gevonden.' };
  const now = Date.now();
  if (advance(room, now)) {
    room.version += 1;
    room.updatedAt = now;
    await writeJSONConfirmed(path, room);
  }
  // Geen lastSeen-write bij elke poll: dat schrijft een volledige kamer weg met
  // eenzelfde versie en kan een zojuist door een andere speler ingediend
  // antwoord overschrijven. De kamerklok wordt alleen bij echte transities
  // weggeschreven (hierboven, met een verhoogde versie).
  return { room: publicRoom(room, playerId) };
}

export async function act(payload) {
  const { action, code, playerId } = payload;
  if (action === 'create') return createRoom(payload);
  if (!code) return { error: 400, message: 'Kamerkode ontbreekt.' };
  const normalizedCode = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  if (action === 'join') {
    return withRoom(normalizedCode, (room, now) => {
      if (room.phase !== 'lobby' && !room.players.some((item) => item.id === playerId)) {
        return { error: 409, message: 'Deze kamer is al gestart.' };
      }
      const existing = room.players.find((item) => item.id === playerId);
      if (existing) {
        existing.lastSeen = now;
        return { write: false };
      }
      const name = cleanName(payload.name);
      if (!name) return { error: 400, message: 'Vul een naam in.' };
      if (room.players.length >= MAX_PLAYERS) return { error: 409, message: 'Kamer zit vol (8 spelers).' };
      room.players.push({ id: playerId, name, score: 0, streak: 0, joinedAt: now, lastSeen: now });
      return null;
    }, playerId);
  }

  if (action === 'start') {
    return withRoom(normalizedCode, (room, now) => {
      if (room.hostId !== playerId) return { error: 403, message: 'Alleen de host kan starten.' };
      if (room.phase !== 'lobby') return { write: false };
      if (room.players.length < 1) return { error: 400, message: 'Niemand om mee te spelen.' };
      room.phase = 'question';
      room.round = 0;
      room.roundStartsAt = now;
      room.roundEndsAt = now + room.settings.seconds * 1000;
      return null;
    }, playerId);
  }

  if (action === 'answer') {
    return withRoom(normalizedCode, (room, now) => {
      if (room.phase !== 'question') return { error: 409, message: 'Deze ronde is gesloten.' };
      if (now >= room.roundEndsAt) return { error: 409, message: 'Tijd voorbij.' };
      if (!room.players.some((item) => item.id === playerId)) return { error: 403, message: 'Je zit niet in deze kamer.' };
      const text = String(payload.answer ?? '').trim();
      if (!text || text.length > 60) return { error: 400, message: 'Antwoord moet 1–60 tekens zijn.' };
      room.roundAnswers[room.round] ||= {};
      const previous = room.roundAnswers[room.round][playerId];
      if (previous?.final) return { write: false };

      const peers = Object.entries(room.roundAnswers[room.round])
        .filter(([id, value]) => id !== playerId && value?.accepted)
        .map(([, value]) => normalize(value.text));
      const result = scoreAnswer({ raw: text, question: findQuestion(room) || {}, peerAnswers: peers });
      const attempts = [...(previous?.attempts || []), { text, at: now, ok: Boolean(result.ok), reason: result.reason || null }];
      room.roundAnswers[room.round][playerId] = {
        text,
        at: now,
        attempts,
        accepted: Boolean(result.ok),
        final: Boolean(result.ok) || attempts.length >= MAX_ANSWER_ATTEMPTS,
        reason: result.ok ? null : result.reason,
      };
      // De ronde pas vervroegen als iedereen klaar is: een speler die nog
      // mag herproberen houdt de klok dus gewoon lopen.
      const values = Object.values(room.roundAnswers[room.round]);
      if (values.length >= room.players.length && values.every((value) => value?.final)) {
        room.roundEndsAt = now + 1200;
      }
      return null;
    }, playerId);
  }

  if (action === 'reveal') {
    // Blob is kort eventual-consistent tussen instanties. Geef een net
    // ingediend antwoord van een andere speler een klein moment om zichtbaar
    // te worden voordat we de ronde afsluiten.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return withRoom(normalizedCode, (room, now) => {
      if (room.phase !== 'question') return { write: false };
      if (room.hostId !== playerId && now < room.roundEndsAt) return { error: 403, message: 'Alleen de host kan vervroegd onthullen.' };
      finalizeRound(room, now);
      return null;
    }, playerId);
  }

  if (action === 'next') {
    return withRoom(normalizedCode, (room, now) => {
      if (room.phase !== 'reveal') return { write: false };
      if (room.hostId !== playerId && now < room.revealUntil) return { error: 403, message: 'Wacht op de host.' };
      nextRound(room, now);
      return null;
    }, playerId);
  }

  if (action === 'rematch') {
    return withRoom(normalizedCode, (room, now) => {
      if (room.hostId !== playerId) return { error: 403, message: 'Alleen de host kan opnieuw starten.' };
      if (room.phase !== 'finished') return { error: 409, message: 'De kamer is nog niet klaar.' };
      const community = room.community || [];
      room.settings.seed = String(payload.seed || `${now}-${Math.random()}`);
      room.questionIds = chooseQuestions(room.settings, community);
      room.players.forEach((player) => {
        player.score = 0;
        player.streak = 0;
      });
      room.round = 0;
      room.phase = 'question';
      room.history = {};
      room.roundAnswers = {};
      room.roundStartsAt = now;
      room.roundEndsAt = now + room.settings.seconds * 1000;
      room.revealUntil = null;
      room.endedAt = null;
      return null;
    }, playerId);
  }

  if (action === 'leave') {
    return withRoom(normalizedCode, (room) => {
      const index = room.players.findIndex((item) => item.id === playerId);
      if (index === -1) return { write: false };
      room.players.splice(index, 1);
      if (room.players.length === 0) return { write: false };
      if (room.hostId === playerId) room.hostId = room.players[0].id;
      return null;
    }, playerId);
  }

  return { error: 400, message: 'Onbekende actie.' };
}

export function publicRoom(room, playerId) {
  const now = Date.now();
  const currentQuestion = room.phase === 'question' || room.phase === 'reveal'
    ? { ...publicQuestion(findQuestion(room)), index: room.round }
    : null;
  const isReveal = room.phase === 'reveal' || room.phase === 'finished';
  const own = room.roundAnswers[room.round]?.[playerId];
  const attemptsUsed = own?.attempts?.length || 0;
  const currentAnswers = isReveal
    ? room.history[room.round]?.answers || {}
    : own
      ? {
          [playerId]: {
            text: own.text,
            pending: !own.final,
            accepted: Boolean(own.accepted),
            final: Boolean(own.final),
            attemptsUsed,
            attemptsLeft: Math.max(0, MAX_ANSWER_ATTEMPTS - attemptsUsed),
            lastReason: own.attempts?.at(-1)?.reason || null,
          },
        }
      : {};

  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    round: room.round,
    totalRounds: room.questionIds.length,
    question: currentQuestion,
    settings: {
      lang: room.settings.lang,
      categories: room.settings.categories,
      rounds: room.settings.rounds,
      seconds: room.settings.seconds,
      mode: room.settings.mode,
    },
    clock: {
      now,
      roundEndsAt: room.roundEndsAt,
      revealUntil: room.revealUntil,
      secondsLeft: room.phase === 'question' ? Math.max(0, Math.ceil((room.roundEndsAt - now) / 1000)) : 0,
    },
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      streak: player.streak,
      isHost: player.id === room.hostId,
      hasAnswered: Boolean(room.roundAnswers[room.round]?.[player.id]?.final),
    })),
    answers: currentAnswers,
    history: room.phase === 'finished' ? room.history : null,
    leaderboard: [...room.players]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((player, index) => ({ rank: index + 1, id: player.id, name: player.name, score: player.score })),
    version: room.version,
  };
}
