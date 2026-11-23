// Aanvullende antwoorden per vraag. De basisvragen blijven handgeschreven;
// per vraag staat een expliciete, op de vraag toegespitste lijst in
// `expansions/`. Voor communityvragen zonder zo'n lijst is er een
// sector/tag-gebaseerde bank als terugval.

import { normalize } from '../lib/scoring.js';
import { SIGNAL_GRID_EXPANSIONS } from './expansions/signal-grid.js';
import { NEON_BIO_EXPANSIONS } from './expansions/neon-bio.js';
import { ARCHIVE_VOID_EXPANSIONS } from './expansions/archive-void.js';
import { STREET_GLITCH_EXPANSIONS } from './expansions/street-glitch.js';

const EXPLICIT_EXPANSIONS = {
  ...SIGNAL_GRID_EXPANSIONS,
  ...NEON_BIO_EXPANSIONS,
  ...ARCHIVE_VOID_EXPANSIONS,
  ...STREET_GLITCH_EXPANSIONS,
};

const COMMON_EXTRA = 11;
const RARE_EXTRA = 6;

// Banken zijn per taal opgesplitst. Komma's zijn de scheiding; antwoorden
// bevatten zelf geen komma.
const BANKS = {
  sound: {
    nl: {
      common: 'een piep, een zoemer, een bel, een sirene, een klik, een zoem, een fluit, een brom, een tik, een alarm, een toon, een gil',
      rare: 'een morsecode, een nagalm, een echo, een zonnestorm, een rookmelder, een tandartsboor',
    },
    en: {
      common: 'a beep, a buzzer, a bell, a siren, a click, a hum, a whistle, a buzz, a tick, an alarm, a tone, a chirp',
      rare: 'Morse code, an echo, a reverberation, a solar storm, a smoke detector, a dentist drill',
    },
  },
  device: {
    nl: {
      common: 'een telefoon, een radio, een wekker, een oven, een lamp, een router, een computer, een printer, een ventilator, een microfoon, een luidspreker, een tablet',
      rare: 'een semafoon, een walkie-talkie, een satellietschotel, een oscilloscoop, een meetmicrofoon, een oude modem',
    },
    en: {
      common: 'a phone, a radio, an alarm clock, an oven, a lamp, a router, a computer, a printer, a fan, a microphone, a speaker, a tablet',
      rare: 'a pager, a walkie-talkie, a satellite dish, an oscilloscope, a studio mic, an old modem',
    },
  },
  secret: {
    nl: {
      common: 'een code, een sleutel, een wachtwoord, een brief, een cijfer, een patroon, een woord, een handdruk, een fluistering, een teken, een codewoord, een cijferreeks',
      rare: 'morse, een eenmalig pad, een verborgen frequentie, een rooksignaal, een spiegel, een watermerk',
    },
    en: {
      common: 'a code, a key, a password, a letter, a number, a pattern, a word, a handshake, a whisper, a signal, a codeword, a number sequence',
      rare: 'Morse, a one-time pad, a hidden frequency, a smoke signal, a mirror, a watermark',
    },
  },
  connection: {
    nl: {
      common: 'slecht bereik, een storing, een lege batterij, een losse kabel, een zwak signaal, een oude router, een drukke frequentie, een update, een blokkade, een verkeerde instelling, een kapotte antenne, afstand',
      rare: 'een zonnestorm, een elektromagnetische puls, een verkeerde poort, een uitgevallen provider, een satellietglitch, een DNS-fout',
    },
    en: {
      common: 'poor signal, an outage, a dead battery, a loose cable, a weak signal, an old router, a crowded frequency, an update, a block, a wrong setting, a broken antenna, distance',
      rare: 'a solar storm, an electromagnetic pulse, a wrong port, a failed provider, a satellite glitch, a DNS error',
    },
  },
  message: {
    nl: {
      common: 'goed nieuws, een uitnodiging, een waarschuwing, een bevestiging, een herinnering, een verzoek, een melding, een berichtje, een advies, een compliment, een antwoord, een groet',
      rare: 'de code is gekraakt, het alarm staat uit, de server is terug, een oude voicemail, een onderschrift, een stille SMS',
    },
    en: {
      common: 'good news, an invitation, a warning, a confirmation, a reminder, a request, a notification, a text, advice, a compliment, a reply, a greeting',
      rare: 'the code is cracked, the alarm is off, the server is back, an old voicemail, a hidden caption, a silent text',
    },
  },
  city: {
    nl: {
      common: 'een auto, een bus, een tram, een fietser, een voetganger, een taxi, een stoep, een verkeerslicht, een etalage, een bankje, een lantaarnpaal, een prullenbak',
      rare: 'een straatnaambord, een ondergrondse parkeergarage, een oude telefooncel, een marktkraam, een roltrap, een graffitiwand',
    },
    en: {
      common: 'a car, a bus, a tram, a cyclist, a pedestrian, a taxi, a sidewalk, a traffic light, a shop window, a bench, a streetlamp, a bin',
      rare: 'a street sign, an underground garage, an old phone booth, a market stall, an escalator, a graffiti wall',
    },
  },
  light: {
    nl: {
      common: 'een lamp, een neonbord, een zonsopgang, een kaars, een tl-buis, een straatlantaarn, een schijnwerper, een autolicht, een scherm, een lichtbundel, een spiegel, een vuurwerk',
      rare: 'een argonbuis, een laser, een gloeidraad, een fosforlaag, een lichtboog, een noorderlicht',
    },
    en: {
      common: 'a lamp, a neon sign, a sunrise, a candle, a fluorescent tube, a streetlight, a spotlight, a car headlight, a screen, a light beam, a mirror, fireworks',
      rare: 'an argon tube, a laser, a filament, a phosphor layer, an arc lamp, an aurora',
    },
  },
  color: {
    nl: {
      common: 'rood, blauw, groen, geel, oranje, paars, roze, cyaan, magenta, wit, zwart, grijs',
      rare: 'neongroen, diep cyaan, ultraviolet, infrarood, zilver, goud',
    },
    en: {
      common: 'red, blue, green, yellow, orange, purple, pink, cyan, magenta, white, black, grey',
      rare: 'neon green, deep cyan, ultraviolet, infrared, silver, gold',
    },
  },
  body: {
    nl: {
      common: 'een hand, een hart, een long, een oog, een oor, een been, een arm, een hoofd, een huid, een nagel, een tand, een voet',
      rare: 'een milt, een appendix, een kniepees, een wenkbrauw, een duim, een ruggengraat, een traanbuis',
    },
    en: {
      common: 'a hand, a heart, a lung, an eye, an ear, a leg, an arm, a head, skin, a nail, a tooth, a foot',
      rare: 'a spleen, an appendix, a knee tendon, an eyebrow, a thumb, a spine, a tear duct',
    },
  },
  health: {
    nl: {
      common: 'rust, water, slaap, een wandeling, vitamine C, een temperatuur, een bloeddruk, een hartslag, een ademhaling, een gewicht, een pols, thee',
      rare: 'een infuus, een scan, een bloedtest, een operatie, een revalidatie, een echo',
    },
    en: {
      common: 'rest, water, sleep, a walk, vitamin C, a temperature, blood pressure, a heartbeat, breathing, weight, a pulse, tea',
      rare: 'an IV drip, a scan, a blood test, surgery, rehab, an ultrasound',
    },
  },
  archive: {
    nl: {
      common: 'een foto, een brief, een dagboek, een cassette, een cd, een usb-stick, een map, een document, een krant, een ticket, een sleutelhanger, een ansichtkaart',
      rare: 'een diskette, microfilm, een gestempeld dossier, een papieren kaart, een hologram, een oude floppy',
    },
    en: {
      common: 'a photo, a letter, a diary, a cassette, a CD, a USB stick, a folder, a document, a newspaper, a ticket, a keychain, a postcard',
      rare: 'a floppy disk, microfilm, a stamped dossier, a paper map, a hologram, an old diskette',
    },
  },
  void: {
    nl: {
      common: 'een ster, een planeet, een maan, een komeet, een meteoor, een satelliet, een donkere wolk, een gat, een schaduw, stilte, een flits, een leegte',
      rare: 'een zwart gat, een pulsar, een quasar, een nevel, een asteroïde, een horizon',
    },
    en: {
      common: 'a star, a planet, a moon, a comet, a meteor, a satellite, a dark cloud, a hole, a shadow, silence, a flash, a void',
      rare: 'a black hole, a pulsar, a quasar, a nebula, an asteroid, a horizon',
    },
  },
  dream: {
    nl: {
      common: 'een vreemd gezicht, een oude kamer, een verdwijning, een vlucht, een stem, een licht, een deur, een spiegel, een trein, een bos, een zee, een woord',
      rare: 'een dubbelganger, een eindeloze gang, een onbekende taal, een tweede zon, een lege stad, een gesprek met een schaduw',
    },
    en: {
      common: 'a strange face, an old room, a disappearance, a flight, a voice, a light, a door, a mirror, a train, a forest, a sea, a word',
      rare: 'a doppelganger, an endless hallway, an unknown language, a second sun, an empty city, a talk with a shadow',
    },
  },
  glitch: {
    nl: {
      common: 'een foutmelding, een zwart scherm, een bevroren beeld, een rare streep, een piep, een herstart, een crash, een update, een verkeerde tijd, een dubbel beeld, een vertraging, een lege pagina',
      rare: 'een geheime code, een onbekende tekst, een verschoven tijdlijn, een spookproces, een onmogelijke kleur, een onbekende coördinaat',
    },
    en: {
      common: 'an error message, a black screen, a frozen frame, a strange stripe, a beep, a restart, a crash, an update, a wrong time, a double image, a lag, a blank page',
      rare: 'a hidden code, unknown text, a shifted timeline, a ghost process, an impossible color, an unknown coordinate',
    },
  },
  job: {
    nl: {
      common: 'een leraar, een arts, een chauffeur, een kassamedewerker, een fabrieksarbeider, een postbode, een accountant, een bakker, een kapper, een vertaler, een bibliothecaris, een bewaker',
      rare: 'een schrijver, een chirurg, een piloot, een archivaris, een monteur, een oude ambachtsman',
    },
    en: {
      common: 'a teacher, a doctor, a driver, a cashier, a factory worker, a mail carrier, an accountant, a baker, a barber, a translator, a librarian, a guard',
      rare: 'a scribe, a surgeon, a pilot, an archivist, a mechanic, an old craftsman',
    },
  },
};

const CATEGORY_CONCEPTS = {
  SIGNAL: ['sound', 'connection', 'message'],
  GRID: ['device', 'connection', 'glitch'],
  NEON: ['light', 'color'],
  BIO: ['body', 'health'],
  ARCHIVE: ['archive', 'message'],
  VOID: ['void', 'dream'],
  STREET: ['city', 'sound'],
  GLITCH: ['glitch', 'dream'],
};

const CONCEPT_TAGS = {
  sound: ['geluid', 'sound', 'herkenning', 'recognition', 'stilte', 'silence', 'morse'],
  device: ['apparaat', 'device', 'hardware', 'computer', 'server', 'router', 'scherm', 'screen', 'lamp', 'bulb', 'schakelaar', 'switch', 'kabel', 'cable', 'systeem', 'system', 'robot', 'object'],
  secret: ['geheim', 'secret', 'code', 'morse', 'wachtwoord', 'password', 'veiligheid', 'security'],
  connection: ['verbinding', 'connection', 'netwerk', 'network', 'signaal', 'signal', 'frequentie', 'frequency', 'zender', 'broadcast', 'storing', 'outage', 'interference', 'radio', 'cloud', 'data', 'internet'],
  message: ['bericht', 'message', 'boodschap', 'news', 'radio', 'herinnering', 'memory', 'info', 'informatie'],
  city: ['stad', 'city', 'straat', 'street', 'stoep', 'sidewalk', 'gevel', 'wall', 'dak', 'roof', 'taxi', 'verkeer', 'traffic', 'markt', 'market', 'plek', 'place', 'ochtend', 'morning', 'deur', 'door', 'toegang', 'access', 'schuilen', 'shelter'],
  light: ['licht', 'light', 'neon', 'flits', 'flash', 'gloeien', 'glow', 'schitteren', 'sparkle', 'shine', 'glans', 'verlichting', 'lighting', 'effect', 'etalage', 'shop', 'sign', 'teken', 'film', 'movie', 'donker', 'dark', 'zicht', 'sight', 'lamp', 'bulb'],
  color: ['kleur', 'color', 'neon'],
  body: ['lichaam', 'body', 'anatomie', 'anatomy', 'bloed', 'blood', 'hartslag', 'heartbeat', 'zintuig', 'sense', 'vloeistof', 'fluid', 'energie', 'energy', 'groei', 'growth', 'opblazen', 'inflate', 'leven', 'life', 'object', 'transplantatie', 'transplant', 'reparatie', 'repair'],
  health: ['gezondheid', 'health', 'medisch', 'medical', 'arts', 'doctor', 'meten', 'measure', 'hoesten', 'cough', 'slapen', 'sleep', 'transplantatie', 'transplant', 'reparatie', 'repair', 'energie', 'energy'],
  archive: ['bewaren', 'keep', 'herinnering', 'memory', 'geheugen', 'recall', 'verleden', 'past', 'geschiedenis', 'history', 'archief', 'archive', 'opslag', 'storage', 'bestand', 'file', 'doos', 'box', 'vondst', 'find', 'datum', 'date', 'opschrijven', 'record', 'computer', 'museum', 'verlies', 'loss', 'verdwenen', 'vanished', 'verdwijnen', 'disappear'],
  void: ['ruimte', 'space', 'astronomie', 'astronomy', 'leegte', 'emptiness', 'onzichtbaar', 'invisible', 'stilte', 'silence', 'zweven', 'float', 'donker', 'dark', 'plek', 'place', 'oneindig', 'infinite', 'verdwijnen', 'vanish', 'verdwenen', 'vanished', 'ruimtestation', 'space station', 'zwaartekracht', 'gravity', 'planeet', 'planet', 'abstract', 'reis', 'travel', 'object'],
  dream: ['droom', 'dream', 'vreemd', 'strange', 'anomalie', 'anomaly', 'verschijnen', 'appear'],
  glitch: ['fout', 'error', 'defect', 'fault', 'vreemd', 'strange', 'anomalie', 'anomaly', 'storing', 'outage', 'beeld', 'image', 'per ongeluk', 'accident', 'tekst', 'text', 'woord', 'word', 'vastlopen', 'stuck', 'klok', 'clock', 'tijd', 'time', 'verschijnen', 'appear', 'systeem', 'system', 'computer', 'scherm', 'screen'],
  job: ['beroep', 'job', 'toekomst', 'future'],
};

const REVERSE_TAGS = new Map();
for (const [concept, tags] of Object.entries(CONCEPT_TAGS)) {
  for (const tag of tags) {
    if (!REVERSE_TAGS.has(tag)) REVERSE_TAGS.set(tag, []);
    REVERSE_TAGS.get(tag).push(concept);
  }
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function addUnique(items, used, target, limits) {
  for (const item of items) {
    const key = normalize(item);
    if (!key || String(item).length > 60 || used.has(key)) continue;
    used.add(key);
    target.push(item);
    if (target.length >= limits) break;
  }
}

export function extraAnswers(question = {}) {
  const used = new Set([...(question.common || []), ...(question.rare || [])].map(normalize));
  const common = [];
  const rare = [];

  // Basisvragen hebben een expliciete, vraagspecifieke lijst. Die gaat altijd
  // vóór generieke banken: zo blijft "noem een kleur" een kleurlijst.
  const explicit = EXPLICIT_EXPANSIONS[question.id];
  if (explicit) {
    addUnique(explicit.common || [], used, common, Infinity);
    addUnique(explicit.rare || [], used, rare, Infinity);
    return { common, rare };
  }

  // Terugval voor ingezonden vragen: tags zijn specifieker dan de sector.
  const lang = question.lang === 'en' ? 'en' : 'nl';
  const concepts = [];
  for (const tag of question.tags || []) {
    for (const concept of REVERSE_TAGS.get(tag) || []) concepts.push(concept);
  }
  concepts.push(...(CATEGORY_CONCEPTS[question.category] || []));

  for (const concept of [...new Set(concepts)]) {
    const bank = BANKS[concept]?.[lang];
    if (!bank) continue;
    addUnique(splitList(bank.common), used, common, COMMON_EXTRA);
    addUnique(splitList(bank.rare), used, rare, RARE_EXTRA);
    if (common.length >= COMMON_EXTRA && rare.length >= RARE_EXTRA) break;
  }

  return { common, rare };
}

// Nieuwe vraag met uitgebreide antwoordlijsten; de expliciete regel blijft
// onaangetast en wordt door answerRule() van de basisvraag afgeleid.
export function expandQuestion(question) {
  const { common, rare } = extraAnswers(question);
  return {
    ...question,
    common: [...(question.common || []), ...common],
    rare: [...(question.rare || []), ...rare],
  };
}
