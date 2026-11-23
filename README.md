# ZERON

**Rare answers only.** Een zelfgebouwd cyberpunk partyspel waarin je niet het *goede* antwoord zoekt, maar het antwoord dat niemand anders bedenkt.

ZERON is een eigen interpretatie van drie bestaande spellen — [PlayAscent](http://playascent.online/), [Krillion](https://krillion.io) en [PlayPlain](https://playplain.app) — met een volledig eigen UI, eigen scoring-engine, een vragenbibliotheek van 224+ vragen, online kamers voor vrienden en een formulier waarmee spelers zelf vragen kunnen insturen.

> Geen affiliate van de originele spellen. Alle code, vormgeving en copy in deze repo is nieuw geschreven. De analyses van de originele sites staan in [`docs/source-analysis/`](docs/source-analysis/).

## Wat kan er?

| Modus | Wat het doet |
|---|---|
| **Solo — Daily Signal** | Elke dag dezelfde 7 vragen voor iedereen (vaste seed). |
| **Solo — Blitz** | Willekeurige run, 3–15 vragen uit gekozen sectoren, 10–60 seconden per vraag. |
| **Party** | Host maakt een kamer met 5-letterige code; tot 8 spelers joinen via link/code. Gedeelde serverklok, verborgen antwoorden tot de reveal, live leaderboard, rematch. |
| **Archive** | Doorzoekbare bibliotheek met alle basis- en communityvragen. |
| **Submit** | Spelers sturen eigen vragen in; die worden direct aan de gedeelde bibliotheek toegevoegd. |

## Snel starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # scoring- en kamer-engine tests
npm run build    # productie-build in dist/
npm run smoke    # live API-check tegen zeron-one.vercel.app
```

Zonder `BLOB_READ_WRITE_TOKEN` gebruikt de API een process-lokale in-memory store: solo werkt altijd, kamers werken dan alleen binnen één proces. Op Vercel is de Blob-store gekoppeld en werken kamers tussen functie-instanties.

## Projectstructuur

```
src/
  main.js              router, schermen, solo-engine, kamer-UI
  styles.css           volledig eigen cyberpunk design (geen UI-kit)
  i18n.js              NL/EN interface-teksten
  data/questions.js    224 vragen, 8 sectoren, 2 talen
  lib/scoring.js       normalize, typo-correctie, validatie, rarity-engine
  lib/api.js           fetch-laag
  lib/audio.js         WebAudio-geluidseffecten (geen assets)
api/
  room.js              kamers: create/join/start/answer/reveal/next/rematch
  questions.js         communityvragen ophalen en indienen
  health.js            statusendpoint
  lib/rooms.js         kamer-state-machine en openbare projectie
  lib/store.js         Vercel Blob / memory adapter
  lib/http.js          request/response helpers
tests/                 node:test suites
docs/                  analyse, architectuur, scoring, deployment
```

## De kern in één alinea

Elke vraag heeft een lijst met voor de hand liggende en zeldzame antwoorden. Een antwoord scoort 5–100 punten: bekende antwoorden laag, zeldzame hoog. In een kamer geldt daarnaast **uniekheid**: als jij als enige een antwoord geeft krijg je +18; elke echo kost 10 punten. Lengte en specificiteit geven kleine bonussen. De dagelijkse run gebruikt een deterministische seed, zodat iedereen dezelfde vragen krijgt — net als bij de drie inspiratiebronnen.

Lees [`docs/SCORING.md`](docs/SCORING.md) voor de exacte formule en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) voor de kamer-state-machine.

## Deploy

Het project staat live op **https://zeron-one.vercel.app** (Vercel-project `zeron`). De productie-deployment is gebouwd vanaf `main`; zie [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) voor de huidige status en het eenmalig koppelen van de Git-repo voor automatische pushes.

## Credits & analyse

- Statische reverse-engineering van de drie bronspellen met de [REA CLI](https://github.com/morluto/rea) en directe codelezing. Rapporten: [`docs/source-analysis/`](docs/source-analysis/).
- Geen externe templates, UI-bibliotheken, lettertypen of afbeeldingen; alle visuele elementen zijn CSS/SVG die in deze repo zijn geschreven.
- De muziek/audio wordt live gegenereerd met de Web Audio API.
