// ZERON scoring engine — shared by the browser and the room API.
// Everything is deterministic: no live player corpus, no network calls.

const DIACRITICS = /[\u0300-\u036f]/g;
const ALLOWED = /[^a-z0-9\s'-]/g;

export function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .replace(ALLOWED, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistanceOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}

// Fix one-character slips only when the intended answer is unambiguous.
export function correctTypo(value, dictionary = []) {
  const words = normalize(value).split(' ').filter(Boolean);
  const known = [...new Set(dictionary.map(normalize).filter(Boolean))];
  const corrected = words.map((word) => {
    if (word.length < 4 || known.includes(word)) return word;
    const candidates = known.filter((item) => editDistanceOne(word, item));
    return candidates.length === 1 ? candidates[0] : word;
  });
  return corrected.join(' ');
}

export function validateAnswer(raw, question = {}) {
  const text = String(raw ?? '').trim();
  const normalized = normalize(text);
  if (!text) return { ok: false, reason: 'EMPTY', normalized: '' };
  if (text.length > 60) return { ok: false, reason: 'TOO_LONG', normalized };
  if (!/[a-z0-9]/i.test(normalized)) return { ok: false, reason: 'NO_CONTENT', normalized };
  if (/(.)\1{4,}/.test(normalized)) return { ok: false, reason: 'GIBBERISH', normalized };
  if (/^(.)\1+$/.test(normalized)) return { ok: false, reason: 'GIBBERISH', normalized };
  if (/https?|www\.|\.com|\.nl\b/i.test(normalized)) return { ok: false, reason: 'NO_LINKS', normalized };
  const rule = question.rule;
  if (rule?.startsWith) {
    const letters = normalize(rule.startsWith);
    if (!normalized.startsWith(letters)) {
      return { ok: false, reason: 'WRONG_START', normalized, expected: rule.startsWith };
    }
  }
  if (rule?.minWords && normalized.split(' ').length < rule.minWords) {
    return { ok: false, reason: 'TOO_SHORT', normalized };
  }
  return { ok: true, reason: null, normalized };
}

function hash32(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rarityLabel(points) {
  if (points < 35) return { key: 'common', label: 'COMMON', color: '#7c8aa6' };
  if (points < 55) return { key: 'uncommon', label: 'UNCOMMON', color: '#8ffff5' };
  if (points < 75) return { key: 'rare', label: 'RARE', color: '#ff3b9d' };
  return { key: 'ghost', label: 'GHOST RARE', color: '#d4ff4f' };
}

// `peerAnswers` is the normalized answer list from the same room round.
// In solo play it is empty; a stable pseudo-rarity is used instead.
export function scoreAnswer({ raw, question = {}, peerAnswers = [], corrected = null }) {
  const validation = validateAnswer(raw, question);
  if (!validation.ok) return { ok: false, reason: validation.reason, points: 0, normalized: validation.normalized };

  const dictionary = [...(question.common || []), ...(question.rare || [])];
  const normalized = corrected ?? correctTypo(validation.normalized, dictionary);
  const commons = (question.common || []).map(normalize);
  const rares = (question.rare || []).map(normalize);
  const peers = peerAnswers.filter(Boolean);
  const duplicates = peers.filter((item) => item === normalized).length;

  let points;
  let source;
  if (commons.includes(normalized)) {
    points = 22;
    source = 'COMMON LIST';
  } else if (rares.includes(normalized)) {
    points = 82;
    source = 'RARE LIST';
  } else {
    // Stable pseudo-rarity: same answer + same question always scores the same.
    const bucket = hash32(`${question.id || question.prompt}|${normalized}`) % 100;
    points = 34 + Math.floor(bucket * 0.38); // 34..71
    source = 'SIGNAL MODEL';
  }

  const notes = [source];
  if (duplicates === 0 && peers.length) {
    points += 18;
    notes.push('SOLO IN ROOM +18');
  } else if (duplicates > 0) {
    points -= 10 * duplicates;
    notes.push(`ECHO ×${duplicates + 1} −${10 * duplicates}`);
  }

  const words = normalized.split(' ').length;
  if (words >= 2) {
    points += 4;
    notes.push('MULTI-WORD +4');
  }
  if (normalized.length >= 8) {
    points += 5;
    notes.push('SPECIFIC +5');
  }
  if (normalized.length >= 12) {
    points += 4;
    notes.push('DEEP CUT +4');
  }
  if (rares.some((item) => editDistanceOne(normalized, item))) {
    points += 8;
    notes.push('NEAR MISS +8');
  }

  points = Math.max(5, Math.min(100, Math.round(points)));
  return {
    ok: true,
    points,
    normalized,
    corrected: normalized !== validation.normalized ? normalized : null,
    label: rarityLabel(points),
    notes,
    duplicateCount: duplicates,
  };
}

export function seededShuffle(list, seed) {
  const array = [...list];
  let state = hash32(String(seed)) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function dailySeed(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
