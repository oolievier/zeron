// ZERON scoring engine — shared by the browser and the room API.
// Everything is deterministic: no live player corpus, no network calls.

const DIACRITICS = /[\u0300-\u036f]/g;
const ALLOWED = /[^a-z0-9\s'-]/g;

// Eerste poging + drie retries. Gedeeld door solo, kamer-API en tests.
export const MAX_ANSWER_ATTEMPTS = 4;

// Alleen antwoorden uit de lijst tellen mee; één typfout mag gecorrigeerd worden.
const DEFAULT_RULE_HINT = 'Antwoord moet in de antwoordlijst van dit signaal staan; één typfout wordt gecorrigeerd.';

// Sectorhint wordt toegevoegd als een vraag geen eigen regel meebrengt.
const CATEGORY_HINTS = {
  SIGNAL: 'Signaal: denk aan geluid, zenden of ontvangen.',
  GRID: 'Het Grid: denk aan netwerk, verbinding of apparaten.',
  NEON: 'Neon: denk aan licht, kleur of nachtelijk straatbeeld.',
  BIO: 'Bio: denk aan lichaam, plant of dier.',
  ARCHIVE: 'Archief: denk aan document, geheugen of oude data.',
  VOID: 'De Void: denk aan ruimte, stilte of het onbekende.',
  STREET: 'Straat: denk aan straat, verkeer of stadsleven.',
  GLITCH: 'Glitch: denk aan fout, storing of vreemde code.',
};

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
  // Ook losse woorden uit meerwoordige antwoorden (bijv. "gerucht" uit
  // "een gerucht") moeten als correctiebron dienen.
  const known = [...new Set(dictionary.flatMap((item) => normalize(item).split(' ')).filter(Boolean))];
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

// Altijd een regel-object opleveren: bestaande velden blijven behouden,
// ontbrekende velden krijgen de standaard lijstregel en een sectorhint.
export function answerRule(question = {}) {
  const categoryHint = CATEGORY_HINTS[question?.category];
  const fallback = {
    kind: 'listed',
    hint: DEFAULT_RULE_HINT,
    ...(categoryHint ? { categoryHint } : {}),
  };
  if (question?.rule && typeof question.rule === 'object') {
    return { ...fallback, ...question.rule, hint: question.rule.hint || fallback.hint };
  }
  return fallback;
}

// Aanvullende regelvelden worden ná de typo-correctie op het eindantwoord gecontroleerd.
function ruleFails(rule, text) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.startsWith && !text.startsWith(normalize(rule.startsWith))) return true;
  if (rule.contains && !text.includes(normalize(rule.contains))) return true;
  if (rule.minWords && text.split(' ').filter(Boolean).length < rule.minWords) return true;
  return false;
}

// Rood label voor alles wat niet als geldig lijstantwoord door de controle komt.
export function wrongLabel() {
  return { key: 'wrong', label: 'Fout', color: '#ff425d' };
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

// Een fout antwoord krijgt géén bonussen, géén minimum en géén pseudo-rarity.
function wrongResult({ reason, normalized = '', corrected = null, extraNotes = [] }) {
  return {
    ok: false,
    wrong: true,
    reason,
    points: 0,
    normalized,
    corrected,
    label: wrongLabel(),
    notes: ['ANTWOORD NIET IN LIJST', ...extraNotes],
    duplicateCount: 0,
  };
}

// `peerAnswers` is de genormaliseerde antwoordlijst van dezelfde ronde.
// Alleen exacte lijstantwoorden (na eventuele typo-correctie) krijgen punten.
export function scoreAnswer({ raw, question = {}, peerAnswers = [], corrected = null } = {}) {
  const validation = validateAnswer(raw, question);
  if (!validation.ok) {
    return wrongResult({
      reason: validation.reason,
      normalized: validation.normalized,
      extraNotes: [`REASON: ${validation.reason}`],
    });
  }

  const dictionary = [...(question.common || []), ...(question.rare || [])];
  const commons = (question.common || []).map(normalize);
  const rares = (question.rare || []).map(normalize);

  // `corrected` blijft als parameter beschikbaar, maar wordt net als de
  // automatische correctie altijd tegen de antwoordlijst gecontroleerd.
  const autoCorrected = correctTypo(validation.normalized, dictionary);
  const candidate = corrected ? normalize(corrected) : autoCorrected;
  const isRare = rares.includes(candidate);
  if (!commons.includes(candidate) && !isRare) {
    return wrongResult({ reason: 'NOT_IN_LIST', normalized: candidate });
  }

  if (ruleFails(answerRule(question), candidate)) {
    return wrongResult({
      reason: 'RULE_FAILED',
      normalized: candidate,
      extraNotes: ['REGEL NIET VOLDAAN'],
    });
  }

  const peers = peerAnswers.map(normalize).filter(Boolean);
  const duplicates = peers.filter((item) => item === candidate).length;

  let points = isRare ? 82 : 22;
  const notes = [isRare ? 'RARE LIST' : 'COMMON LIST'];
  if (duplicates === 0 && peers.length) {
    points += 18;
    notes.push('SOLO IN ROOM +18');
  } else if (duplicates > 0) {
    points -= 10 * duplicates;
    notes.push(`ECHO ×${duplicates + 1} −${10 * duplicates}`);
  }

  const words = candidate.split(' ').length;
  if (words >= 2) {
    points += 4;
    notes.push('MULTI-WORD +4');
  }
  if (candidate.length >= 8) {
    points += 5;
    notes.push('SPECIFIC +5');
  }
  if (candidate.length >= 12) {
    points += 4;
    notes.push('DEEP CUT +4');
  }
  if (rares.some((item) => editDistanceOne(candidate, item))) {
    points += 8;
    notes.push('NEAR MISS +8');
  }

  points = Math.max(5, Math.min(100, Math.round(points)));
  return {
    ok: true,
    wrong: false,
    reason: null,
    points,
    normalized: candidate,
    // Alleen melden als de correctie ook echt naar een lijstantwoord ging.
    corrected: candidate !== validation.normalized ? candidate : null,
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
