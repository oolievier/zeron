// ZERON scoring engine — shared by the browser and the room API.
// Everything is deterministic: no live player corpus, no network calls.

const DIACRITICS = /[\u0300-\u036f]/g;
const ALLOWED = /[^a-z0-9\s'-]/g;

// Eerste poging + drie retries. Gedeeld door solo, kamer-API en tests.
export const MAX_ANSWER_ATTEMPTS = 4;

// Elk antwoord heeft zijn eigen gewicht. De zes bands overlappen niet, zodat
// "civilian" altijd laag scoort en "singularity" altijd het hoogst.
const DEFAULT_RULE_HINT = 'Een herkenbaar antwoord voor dit signaal telt; hoe zeldzamer, hoe meer punten.';
export const TIER_RANGES = {
  civilian: { min: 5, max: 14 },
  noise: { min: 17, max: 27 },
  runner: { min: 30, max: 46 },
  operator: { min: 49, max: 65 },
  ghost: { min: 68, max: 82 },
  singularity: { min: 85, max: 100 },
};
export const TIER_LABELS = {
  civilian: 'CIVILIAN',
  noise: 'NOISE',
  runner: 'RUNNER',
  operator: 'OPERATOR',
  ghost: 'GHOST',
  singularity: 'SINGULARITY',
};
export const ANSWER_TIERS = Object.keys(TIER_RANGES);
const ARTICLES = /^(een|de|het|the|a|an)\s+/;
const STOPWORDS = new Set([
  'een', 'de', 'het', 'the', 'a', 'an', 'van', 'met', 'in', 'op', 'die', 'dat',
  'zijn', 'niet', 'door', 'aan', 'bij', 'uit', 'over', 'voor', 'naar', 'wordt',
  'geen', 'of', 'te', 'of', 'and', 'with', 'that', 'this', 'there', 'some',
]);

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
  TERRAIN: 'Terrein: denk aan berg, rivier, kaart of coördinaat.',
  CLIMATE: 'Klimaat: denk aan weer, wind, wolken of temperatuur.',
  CULTURE: 'Cultuur: denk aan muziek, film, kunst of subcultuur.',
  CREDITS: 'Credits: denk aan geld, betalen, prijs of handel.',
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
  // Herhaalde letters zijn onzin; herhaalde cijfers zijn geldige slechte
  // wachtwoorden ("111111") of morse-codes, dus die laten we door.
  if (/([a-z])\1{4,}/.test(normalized)) return { ok: false, reason: 'GIBBERISH', normalized };
  if (normalized.length >= 4 && /^([a-z])\1+$/.test(normalized)) return { ok: false, reason: 'GIBBERISH', normalized };
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

// Binnen elke band krijgt elk antwoord zijn eigen, reproduceerbare waarde.
// Lengte en meerdere woorden tellen licht mee; de bandgrenzes overlappen niet.
export function answerWeight(text, tier = 'civilian') {
  const range = TIER_RANGES[tier] || TIER_RANGES.civilian;
  const key = normalize(text);
  const span = range.max - range.min + 1;
  const jitter = hash32(`zeron:${tier}:${key}`) % span;
  const lengthBonus = Math.min(6, Math.floor(key.length / 7));
  const wordBonus = Math.min(6, Math.max(0, key.split(' ').length - 1) * 3);
  return range.min + ((jitter + lengthBonus + wordBonus) % span);
}

function singularWord(word) {
  if (word.length < 4) return word;
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function dutchStemWord(word) {
  if (word.length < 5) return word;
  if (word.endsWith('en')) return word.slice(0, -2);
  if (word.endsWith('e')) return word.slice(0, -1);
  return word;
}

// Herkenning werkt op meerdere schrijfvormen tegelijk: "een wekkers",
// "wekkers", "wekker" en "wekkeren" moeten allemaal hetzelfde antwoord vinden.
export function answerVariants(value) {
  const base = normalize(value);
  if (!base) return [];
  const variants = new Set([base]);
  const stripped = base.replace(ARTICLES, '');
  if (stripped && stripped !== base) variants.add(stripped);
  for (const item of [...variants]) {
    const tokens = item.split(' ').filter(Boolean);
    variants.add(tokens.map(singularWord).join(' '));
    variants.add(tokens.map(dutchStemWord).join(' '));
    variants.add(tokens.map((word) => dutchStemWord(singularWord(word))).join(' '));
  }
  return [...variants].filter(Boolean);
}

function meaningfulTokens(text) {
  return text.split(' ').filter(Boolean).filter((token) => !STOPWORDS.has(token));
}

// "oude wekker" vindt "wekker"; "wekker" vindt "een oude wekker".
function phraseCovers(a, b) {
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  if (` ${a} `.includes(` ${b} `)) return true;
  const aTokens = meaningfulTokens(a);
  const bTokens = meaningfulTokens(b);
  if (!aTokens.length || !bTokens.length) return false;
  const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
  const longer = aTokens.length <= bTokens.length ? bTokens : aTokens;
  return shorter.every((token) => longer.includes(token));
}

const QUALITY_RANK = { typo: 1, variant: 2, exact: 3 };

function compareForms(candidate, variant) {
  if (candidate === variant) return 'exact';
  if (editDistanceOne(candidate, variant)) return 'typo';
  if (phraseCovers(candidate, variant)) return 'variant';
  return null;
}

const registryCache = new WeakMap();

// question.answers wordt door answer-banks.js gebouwd. Voor oude/opgeslagen
// vragen zonder dat veld blijven common/rare werken als terugval.
export function answerEntries(question = {}) {
  const source = Array.isArray(question.answers) && question.answers.length
    ? question.answers
    : [
      ...(question.common || []).map((text) => ({ text, tier: 'civilian', points: answerWeight(text, 'civilian') })),
      ...(question.rare || []).map((text) => ({ text, tier: 'ghost', points: answerWeight(text, 'ghost') })),
    ];
  const cached = registryCache.get(source);
  if (cached) return cached;
  const entries = [];
  const seen = new Set();
  for (const item of source) {
    const key = normalize(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ ...item, normalized: key, variants: answerVariants(item.text) });
  }
  registryCache.set(source, entries);
  return entries;
}

function findAnswer(raw, question = {}, corrected = null) {
  const text = corrected == null ? raw : corrected;
  const candidates = answerVariants(text);
  let best = null;
  for (const entry of answerEntries(question)) {
    for (const candidate of candidates) {
      for (const variant of entry.variants) {
        const quality = compareForms(candidate, variant);
        if (!quality) continue;
        const rank = QUALITY_RANK[quality];
        if (!best || rank > best.rank || (rank === best.rank && entry.points > best.points)) {
          best = { entry, quality, rank, canonical: variant };
        }
      }
    }
  }
  return best;
}

export function rarityLabel(points) {
  if (points < 15) return { key: 'civilian', label: TIER_LABELS.civilian, color: '#7c8aa6' };
  if (points < 28) return { key: 'noise', label: TIER_LABELS.noise, color: '#8ffff5' };
  if (points < 47) return { key: 'runner', label: TIER_LABELS.runner, color: '#39ff14' };
  if (points < 66) return { key: 'operator', label: TIER_LABELS.operator, color: '#ffb000' };
  if (points < 83) return { key: 'ghost', label: TIER_LABELS.ghost, color: '#ff3b9d' };
  return { key: 'singularity', label: TIER_LABELS.singularity, color: '#eaff00' };
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

// `peerAnswers` is de antwoordlijst van dezelfde ronde. Herkende varianten
// (lidwoord, meervoud, synoniem, één typfout) krijgen het gewicht van het
// antwoord dat ze bedoelen; onbekende antwoorden blijven écht fout.
export function scoreAnswer({ raw, question = {}, peerAnswers = [], corrected = null } = {}) {
  const validation = validateAnswer(raw, question);
  if (!validation.ok) {
    return wrongResult({
      reason: validation.reason,
      normalized: validation.normalized,
      extraNotes: [`REASON: ${validation.reason}`],
    });
  }

  const match = findAnswer(raw, question, corrected);
  if (!match) {
    return wrongResult({ reason: 'NOT_IN_LIST', normalized: validation.normalized });
  }

  if (ruleFails(answerRule(question), match.canonical)) {
    return wrongResult({
      reason: 'RULE_FAILED',
      normalized: match.canonical,
      extraNotes: ['REGEL NIET VOLDAAN'],
    });
  }

  const tier = TIER_RANGES[match.entry.tier] ? match.entry.tier : 'civilian';
  const basePoints = match.entry.points;
  let points = basePoints;
  const notes = [`${TIER_LABELS[tier]} ${basePoints}`];
  if (match.quality === 'variant') notes.push('VARIANT HERKEND');
  if (match.quality === 'typo') {
    points -= 3;
    notes.push('TYPFOUT HERSTELD −3');
  }

  const peers = peerAnswers.map(normalize).filter(Boolean);
  const duplicates = peers.filter((item) => answerVariants(item).includes(match.canonical)).length;
  if (duplicates === 0 && peers.length) {
    points += 18;
    notes.push('SOLO IN ROOM +18');
  } else if (duplicates > 0) {
    points -= 10 * duplicates;
    notes.push(`ECHO ×${duplicates + 1} −${10 * duplicates}`);
  }

  points = Math.max(5, Math.min(100, Math.round(points)));
  return {
    ok: true,
    wrong: false,
    reason: null,
    points,
    normalized: match.canonical,
    tier,
    // Alleen melden als de herkenning het antwoord daadwerkelijk aanpaste.
    corrected: validation.normalized !== match.canonical ? match.canonical : null,
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
