// Vult een expliciet antwoordregister aan tot 400 unieke, reproduceerbare
// antwoorden per vraag. De uitbreidingen zijn afgeleid van de bestaande,
// vraagspecifieke antwoorden: lidwoorden, meervouden, verkleinwoorden,
// kwalificaties en context — dus geen willekeurige woorden uit andere sectoren.

import { ANSWER_TIERS, normalize } from '../../lib/scoring.js';

const ARTICLE = /^(een|de|het|the|a|an)\s+/i;
const ADJECTIVES = [
  'oude', 'nieuwe', 'grote', 'kleine', 'kapotte', 'digitale', 'analoge',
  'moderne', 'stille', 'heldere', 'donkere', 'zware', 'vintage',
  'old', 'new', 'big', 'small', 'broken', 'digital', 'analog', 'modern',
  'quiet', 'bright', 'dark', 'heavy', 'worn',
];
const CONTEXTS = [
  'in de stad', 'op straat', 'thuis', 'in de nacht', 'overdag',
  'in de keuken', 'in de auto', 'op school', 'in het bos', 'in de file',
  'op het werk', 'in de trein', 'op de markt',
  'downtown', 'at night', 'at home', 'in the street', 'on the road',
  'in the kitchen', 'at work', 'nearby',
];
const PREFIXES = ['mijn', 'jouw', 'ons', 'my', 'your', 'our'];
const TYPES = ['soort', 'type', 'type of'];
const SUFFIXES = ['s', 'en', 'es', 'je', 'tje'];

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function plausible(text) {
  if (!text || text.length > 60) return false;
  if (/[,\n\r]|https?|www\.|\.(com|nl)\b/i.test(text)) return false;
  const key = normalize(text);
  if (!/[a-z0-9]/.test(key)) return false;
  if (/([a-z])\1{4,}/.test(key)) return false;
  return true;
}

function templates(core, singleWord) {
  const forms = [];
  for (const article of ['een', 'de', 'the', 'a']) forms.push(`${article} ${core}`);
  for (const suffix of SUFFIXES) forms.push(`${core}${suffix}`);
  if (singleWord) {
    for (const adjective of ADJECTIVES) forms.push(`${adjective} ${core}`);
    for (const prefix of PREFIXES) forms.push(`${prefix} ${core}`);
  }
  for (const context of CONTEXTS) forms.push(`${core} ${context}`);
  if (singleWord) {
    for (const type of TYPES) forms.push(`${type} ${core}`, `een ${type} ${core}`);
  }
  return forms;
}

// Elke uitbreiding krijgt een band dicht bij de band van het oorspronkelijke
// antwoord, zodat de zeldzaamheidsverhouding behouden blijft.
function shiftedTier(tier, seed) {
  const index = Math.max(0, ANSWER_TIERS.indexOf(tier));
  const offset = (seed % 3) - 1;
  return ANSWER_TIERS[Math.min(ANSWER_TIERS.length - 1, Math.max(0, index + offset))];
}

export function expandRegister(entries, id = 'vraag', target = 400) {
  if (entries.length >= target) return entries.slice(0, target);

  const needed = target - entries.length;
  const seen = new Set(entries.map((entry) => normalize(entry.text)));
  const result = [...entries];
  const cap = needed * 3;
  let produced = 0;

  for (const entry of entries) {
    if (produced >= cap) break;
    const core = normalize(entry.text).replace(ARTICLE, '').trim();
    if (core.length < 3 || core.length > 24) continue;
    const words = core.split(' ');
    const roots = words.length === 1
      ? [core]
      : [core, ...words.filter((word) => word.length >= 4 && !seen.has(word))];

    for (const root of roots) {
      if (produced >= cap) break;
      const forms = templates(root, root.split(' ').length === 1);
      const start = hash(`${id}:${root}`) % forms.length;
      // Een roterende selectie geeft variatie zonder dure sorteer-pass.
      const perRoot = Math.max(16, Math.ceil(cap / Math.max(1, entries.length)));
      for (let step = 0; step < perRoot && produced < cap; step += 1) {
        const text = forms[(start + step) % forms.length];
        if (!plausible(text)) continue;
        const key = normalize(text);
        if (seen.has(key)) continue;
        seen.add(key);
        produced += 1;
        result.push({ text, tier: shiftedTier(entry.tier, hash(`${id}:${key}`)) });
        if (result.length >= target) return balance(result, target);
      }
    }
  }
  return balance(result, target);
}

// Genereerde vormen komen vaak uit de laagste bands. Zorg dat ook de zeldzame
// bands een bruikbare breedte houden door overtollige antwoorden over te
// hevelen; de puntwaarde wordt in answer-banks.js opnieuw berekend.
function balance(entries, target) {
  const minimum = Math.min(30, Math.floor(target / ANSWER_TIERS.length));
  const byTier = new Map(ANSWER_TIERS.map((tier) => [tier, []]));
  for (const entry of entries) byTier.get(entry.tier)?.push(entry);

  for (const tier of ANSWER_TIERS) {
    while (byTier.get(tier).length < minimum) {
      const donor = [...ANSWER_TIERS]
        .filter((name) => byTier.get(name).length > minimum)
        .sort((a, b) => byTier.get(b).length - byTier.get(a).length)[0];
      if (!donor) return entries;
      const moved = byTier.get(donor).pop();
      moved.tier = tier;
      byTier.get(tier).push(moved);
    }
  }
  return ANSWER_TIERS.flatMap((tier) => byTier.get(tier));
}
