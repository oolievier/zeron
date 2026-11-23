# ZERON architectuur

## Overzicht

```
Browser (Vite, vanilla JS, geen framework)
  ├─ hash-router → schermen (home, setup, solo, party, room, archive, submit, how, result)
  ├─ scoring.js  → deterministische herkenning + gewogen antwoordscores (ook in de API)
  ├─ data/recognition/ → 424 vraagspecifieke registers, zes gewogen bands
  ├─ api.js      → fetch naar /api/* + sessietoken uit localStorage
  └─ styles.css  → handgemaakte neon-UI, glitch-bursts, score-lift
                         │
Vercel (Node serverless functions)
  ├─ /api/health
  ├─ /api/questions  → communityvragen (GET/POST)
  ├─ /api/room       → kamer-state-machine (GET/POST)
  └─ /api/account    → register/verify/login/me/saveRun/logout
                         │
Vercel Blob (private, BLOB_READ_WRITE_TOKEN)
  ├─ rooms/<CODE>.json
  ├─ community/<ID>.json
  ├─ accounts/<sha256(email)>.json
  └─ sessions/<sha256(token)>.json
```

De client is een statische SPA; `vercel.json` rewritten alle niet-`/api/` paden naar `index.html`. Hash-routing betekent dat er geen server-side routing nodig is.

De vragenpool (424 vragen, 2 talen) is verdeeld over 12 sectoren: `SIGNAL`, `GRID`, `NEON`, `BIO`, `ARCHIVE`, `VOID`, `STREET`, `GLITCH`, `TERRAIN` (topografie), `CLIMATE`, `CULTURE` en `CREDITS`. Elk antwoordregister is onderverdeeld in zes cyberpunk-bands: `civilian` (5–14), `noise` (17–27), `runner` (30–46), `operator` (49–65), `ghost` (68–82) en `singularity` (85–100).

## Kamer-state-machine

Een kamer (`rooms/<code>.json`) bevat:

| Veld | Betekenis |
|---|---|
| `hostId`, `players[]` | deelnemers (id, naam, score, streak, `hasAnswered` wordt afgeleid) |
| `settings` | taal, sectoren, rondes, seconden, seed, mode |
| `questionIds`, `community` | gekozen deck + snapshot van communityvragen |
| `phase` | `lobby` → `question` → `reveal` → … → `finished` |
| `round`, `roundStartsAt`, `roundEndsAt`, `revealUntil` | serverklok |
| `roundAnswers[round]` | pogingen per speler: `attempts[]`, `accepted`, `final`, laatste `text` (alleen zichtbaar voor de eigen speler) |
| `history[round]` | scoring-resultaten na de reveal |
| `version`, `updatedAt` | eenvoudige revisieteller |

Transities worden **server-side** afgedwongen in `advance()` bij elke lees- of schrijfactie:

- `question` → `reveal` zodra `now >= roundEndsAt`;
- `reveal` → volgende `question` (of `finished`) zodra `now >= revealUntil` (7 seconden).

Een fout antwoord is geen definitief antwoord: de server bewaart de poging en geeft de speler maximaal 4 pogingen (`MAX_ANSWER_ATTEMPTS`) binnen dezelfde timer. Alleen als alle spelers een `final` antwoord hebben (geldig of uitgeput) wordt `roundEndsAt` vervroegd naar `now + 1200 ms`. De host kan vervroegd onthullen; niet-hosts kunnen dat niet. Bij timeout scoren ontbrekende of niet-geaccepteerde antwoorden 0 punten met een rood `wrong`-label.

### Openbare projectie

`publicRoom()` is de enige uitvoer naar clients. Het:

- verbergt alle antwoorden van andere spelers tijdens `question` (alleen de eigen pogingen komen terug, met `attemptsLeft` en de laatste foutreden);
- verbergt het volledige gewogen antwoordregister (`answers`), `questionIds`, `community` en de ruwe kamerstructuur;
- geeft `clock.now` mee, zodat de client klok-skew kan compenseren;
- levert `leaderboard` en (alleen in `finished`) de volledige `history`;
- stuurt de vraagregel (`rule`) mee, maar nooit het antwoordregister.

Antwoorden worden bij de reveal door de server gescoord tegen het gewogen register van de vraag. Herkende synoniemen/varianten krijgen het gewicht van het bedoelde antwoord; onherkende antwoorden krijgen `wrong: true`, `points: 0` en een rood label. Er worden geen pseudo-rarity-punten meer toegekend.

**Belangrijk:** alle POST-acties gebruiken dezelfde projectie. Vroege versies gaven de interne kamer terug; dat is gecorrigeerd en afgedekt met tests.

## Polling en klok

De client pollt `/api/room?code=…&playerId=…` elke 1200 ms. De server-timestamp (`clock.now`) minus `Date.now()` levert een offset; de afteller gebruikt `Date.now() + offset` en `clock.roundEndsAt`. Daardoor loopt de timer niet uit sync door een trage client of afwijkende systeemtijd.

De UI rendert volledig opnieuw als de `roomSignature` verandert (`phase:round:version:answered-flags`); tussenliggende polls updaten alleen de timer-DOM. Het ingetypte antwoord wordt bij een her-render bewaard en hersteld.

## Opslag

`api/lib/store.js` kiest:

- **Productie:** `@vercel/blob` met `BLOB_READ_WRITE_TOKEN` (private store `zeron-data`), paden zonder random suffix, `cacheControlMaxAge: 0`.
- **Lokaal zonder token:** een `Map` in het proces. Handig voor tests en solo, niet gedeeld tussen serverless instanties.

Elke mutatie leest de kamer, past die aan en schrijft het volledige JSON-object terug. Dat is atomair per blob, maar **last-write-wins** bij gelijktijdige schrijven. Omdat private Blob-reads via de edge-cache kort verouderd kunnen zijn, leest `readJSON()` met `useCache: false` en wacht `writeJSONConfirmed()` tot de weggeschreven `version` weer leesbaar is vóór de API antwoordt; een `reveal` geeft late antwoorden daarnaast 300 ms de tijd om zichtbaar te worden. Polls schrijven geen `lastSeen` meer weg, zodat ze geen versere antwoorden kunnen overschrijven. Bij zwaar gelijktijdig gebruik blijft een echte transactiestore (Redis/Postgres) de logische volgende stap.

## Accounts en e-mailverificatie

`/api/account` beheert e-mailaccounts naast het lokale `playerId`:

- **Register:** e-mail + wachtwoord (min. 8) + callsign (2–18). Wachtwoord met `scryptSync` + random salt gehasht; opslag onder `accounts/<sha256(email)>.json`.
- **Verify:** token = `<key>.<random hex>`, 24 uur geldig; alleen de hash wordt opgeslagen. De link wijst naar `/#/verify/<token>` en logt de gebruiker na verificatie direct in.
- **Login/sessie:** wachtwoordcontrole met `timingSafeEqual`; sessietoken (32 random bytes, base64url) alleen als hash in `sessions/<hash>.json`, 30 dagen geldig. De client stuurt `x-zeron-session` mee en bewaart de token in `localStorage`.
- **saveRun:** verhoogt `plays`, houdt `best` bij, voegt max. 20 runs toe aan `history`, update streak en daily score. Wordt na een solo-run aangeroepen als de speler is ingelogd.
- **Mail:** `api/lib/mail.js` kiest SMTP bij complete `ZERON_SMTP_*`-variabelen, daarna Resend bij een `RESEND_API_KEY`, en anders de directe link. SMTP werkt zonder eigen domein (bijv. Gmail met app-wachtwoord); Resend vereist een geverifieerd domein. Bij een falende provider wordt geen fout gegooid: de response bevat `devToken`/`devLink`, zodat verificatie ook lokaal en in preview direct werkt. Tokens, keys en wachtwoorden worden nooit gelogd.

De UI heeft een account-scherm met profiel, verificatiestatus, opnieuw-versturen en uitloggen. Guest-play blijft mogelijk; accounts zijn optioneel.

## Beveiliging en validatie

- Alle dynamische tekst in de UI gaat door `esc()` (HTML-escaping).
- Spelersnamen: maximaal 18 tekens, control characters verwijderd.
- Antwoorden: maximaal 60 tekens; server accepteert alleen deelnemers die in de kamer zitten.
- Vraaginzendingen: lengte- en woordlimieten, links/scheldwoorden geweigerd, honeypotveld tegen spam.
- Geen analytics of advertenties. Een lokale `playerId` in `localStorage` identificeert gastspelers; accounts gebruiken een aparte sessietoken.
- Glitch-/transitieanimaties zijn volledig decoratief (`pointer-events: none`) en respecteren `prefers-reduced-motion`; de game-klok start pas ná een transitie.

## Tests

```bash
npm test
```

Dekt: normalisatie, variant- en typo-herkenning, validatie, fout antwoorden (0 punten), gewogen antwoordscores, deterministische shuffle, kamerjoin/start/answer/reveal/next, retries, zichtbaarheid van antwoorden, host-autorisatie én de volledige accountflow (register → verify → login → me → saveRun → logout).
