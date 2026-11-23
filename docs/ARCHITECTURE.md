# ZERON architectuur

## Overzicht

```
Browser (Vite, vanilla JS, geen framework)
  ├─ hash-router → schermen (home, setup, solo, party, room, archive, submit, how, result)
  ├─ scoring.js  → deterministische rarity-engine (ook gebruikt door de API)
  └─ api.js      → fetch naar /api/*
                         │
Vercel (Node serverless functions)
  ├─ /api/health
  ├─ /api/questions  → communityvragen (GET/POST)
  └─ /api/room       → kamer-state-machine (GET/POST)
                         │
Vercel Blob (private, BLOB_READ_WRITE_TOKEN)
  ├─ rooms/<CODE>.json
  └─ community/<ID>.json
```

De client is een statische SPA; `vercel.json` rewritten alle niet-`/api/` paden naar `index.html`. Hash-routing betekent dat er geen server-side routing nodig is.

## Kamer-state-machine

Een kamer (`rooms/<code>.json`) bevat:

| Veld | Betekenis |
|---|---|
| `hostId`, `players[]` | deelnemers (id, naam, score, streak, `hasAnswered` wordt afgeleid) |
| `settings` | taal, sectoren, rondes, seconden, seed, mode |
| `questionIds`, `community` | gekozen deck + snapshot van communityvragen |
| `phase` | `lobby` → `question` → `reveal` → … → `finished` |
| `round`, `roundStartsAt`, `roundEndsAt`, `revealUntil` | serverklok |
| `roundAnswers[round]` | ruwe antwoorden (alleen zichtbaar voor de eigen speler) |
| `history[round]` | scoring-resultaten na de reveal |
| `version`, `updatedAt` | eenvoudige revisieteller |

Transities worden **server-side** afgedwongen in `advance()` bij elke lees- of schrijfactie:

- `question` → `reveal` zodra `now >= roundEndsAt`;
- `reveal` → volgende `question` (of `finished`) zodra `now >= revealUntil` (7 seconden).

Als alle spelers hebben geantwoord wordt `roundEndsAt` vervroegd naar `now + 1200 ms`. De host kan vervroegd onthullen; niet-hosts kunnen dat niet.

### Openbare projectie

`publicRoom()` is de enige uitvoer naar clients. Het:

- verbergt alle antwoorden van andere spelers tijdens `question` (alleen het eigen antwoord wordt teruggegeven);
- verbergt `common`/`rare` antwoordlijsten, `questionIds`, `community` en de ruwe kamerstructuur;
- geeft `clock.now` mee, zodat de client klok-skew kan compenseren;
- levert `leaderboard` en (alleen in `finished`) de volledige `history`.

**Belangrijk:** alle POST-acties gebruiken dezelfde projectie. Vroege versies gaven de interne kamer terug; dat is gecorrigeerd en afgedekt met tests.

## Polling en klok

De client pollt `/api/room?code=…&playerId=…` elke 1200 ms. De server-timestamp (`clock.now`) minus `Date.now()` levert een offset; de afteller gebruikt `Date.now() + offset` en `clock.roundEndsAt`. Daardoor loopt de timer niet uit sync door een trage client of afwijkende systeemtijd.

De UI rendert volledig opnieuw als de `roomSignature` verandert (`phase:round:version:answered-flags`); tussenliggende polls updaten alleen de timer-DOM. Het ingetypte antwoord wordt bij een her-render bewaard en hersteld.

## Opslag

`api/lib/store.js` kiest:

- **Productie:** `@vercel/blob` met `BLOB_READ_WRITE_TOKEN` (private store `zeron-data`), paden zonder random suffix, `cacheControlMaxAge: 0`.
- **Lokaal zonder token:** een `Map` in het proces. Handig voor tests en solo, niet gedeeld tussen serverless instanties.

Elke mutatie leest de kamer, past die aan en schrijft het volledige JSON-object terug. Dat is atomair per blob, maar **last-write-wins** bij gelijktijdige schrijven. Voor een vriendenkamer is dat acceptabel; een echte transactiestore (Redis/Postgres) is de logische volgende stap bij zwaar gebruik.

## Beveiliging en validatie

- Alle dynamische tekst in de UI gaat door `esc()` (HTML-escaping).
- Spelersnamen: maximaal 18 tekens, control characters verwijderd.
- Antwoorden: maximaal 60 tekens; server accepteert alleen deelnemers die in de kamer zitten.
- Vraaginzendingen: lengte- en woordlimieten, links/scheldwoorden geweigerd, honeypotveld tegen spam.
- Geen accounts, geen e-mailadressen, geen analytics of advertenties. Alleen een willekeurige lokale `playerId` in `localStorage`.

## Tests

```bash
npm test
```

Dekt: normalisatie, typo-correctie, validatie, rarity-scoring, deterministische shuffle, kamerjoin/start/answer/reveal/next, zichtbaarheid van antwoorden en host-autorisatie.
