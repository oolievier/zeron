# PLAIN — technisch/UX reverse-engineering rapport

**Doel:** statische referentie-analyse van Play Plain (`https://playplain.app`) ten behoeve van het ontwerp van **ZERON**, een cyberpunk-variant van een dagelijks schattingsspel met *rare answers*.

**Bron:** `/tmp/opencode/playplain.html` — 209.848 bytes, 209.212 tekens, **één enkele regel** (`wc -l` geeft 0 newline-afsluiters). Alle bewijsverwijzingen daarom als **regel 1, kolom X** (0-based tekenoffset in de UTF-8-tekst). Waar ik een snippet uit de RSC-payload citeer, staat eerst de ruwe kolom van de escaped tekst; de weergave is gedescaped/leesbaar gemaakt.

**Methode — strikt statisch:** alleen de HTML, de inline `<script>`-blokken, inline `style`/class-attributen, de ingebedde Next.js RSC-flightpayload en de aanwezige asset-URL's zijn als tekst gelezen. **Geen** JavaScript-uitvoering, **geen** browser, **geen** netwerkverzoek, **geen** externe CSS/JS/JSON opgehaald. Externe chunks worden alleen genoemd zoals ze in de HTML voorkomen; hun inhoud is niet onderzocht.

**Labels:** `[FEIT]` = direct zichtbaar in de bron. `[AFGELEID]` = logische conclusie uit meerdere statische aanwijzingen. `[AANNAME]` = niet uit deze bron te bepalen; nadrukkelijk geen feit.

---

## 1. Document, title en meta

**[FEIT]** `<html data-dpl-id="a3ee261" lang="en" dir="ltr" data-theme="dark" class="T19VSG_variable">` (r1, k0). De hash `a3ee261` komt als `?dpl=a3ee261` terug op vrijwel alle statische assets: dit is een deploy-identificatie. `T19VSG_variable` is een gegenereerde CSS-scope-klasse.

**[FEIT]** Titel en beschrijving (r1, k3350 e.v.):

```html
<title>Plain — the daily guessing game</title>
<meta name="description" content="Play Plain, the free 3-minute daily game: 7 prompts, one target number each. Name the answer closest to the target."/>
```

Dezelfde tekst staat in `og:title`, `og:description` en `twitter:*` (k4010–4560). `canonical` is `https://playplain.app` (k3646), `og:url` idem, `og:site_name` = `Plain`, `og:locale` = `en`, `og:type` = `website`, `twitter:card` = `summary_large_image`. **Er staat geen `og:image` in de bron**, ondanks de `summary_large_image`-card. `[AANNAME]` de social image wordt elders/dynamisch gegenereerd of de card-value is een restant.

**[FEIT]** Overige meta/PWA (k3216–4998):

```html
<meta name="theme-color" content="#0b0d12"/>
<meta name="color-scheme" content="dark light"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"/>
<link rel="manifest" href="/manifest.webmanifest"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="Plain"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black"/>
<meta name="format-detection" content="telephone=no"/>
<meta name="listdle-verification" content="8798f2bf-c467-4b5b-af17-b14ba29aeceb"/>
```

Favicons: `/favicon.ico`, `/icons/icon.svg`, `/icons/icon-192.png`, `/icons/apple-touch-icon.png` (k4714–4998). JSON-LD (r1, k6460 e.v.):

```json
{"@context":"https://schema.org","@type":"WebSite","name":"Plain","alternateName":["Play Plain","PlayPlain","Plain game"],"url":"https://playplain.app/"}
```

**[AFGELEID]** De combine van manifest, standalone-meta, `viewport-fit=cover`, veilige bounding boxes en install-copy in de RSC-dictionary (`site.install.*`, r1 k184080 e.v.) maakt PWA-installatie een eerste-class citizen, geen nachgedachte.

---

## 2. Technische architectuur in de statische shell

**[FEIT]** Next.js + Turbopack. In de `<head>` staan 3 stylesheets, 1 voorgeladen WOFF2 en 32 script-URL's (waarvan één `noModule`). Voorbeelden:

```html
<link rel="preload" href="/_next/static/media/605ce01b664af129-s.p.0wgildi0cnwt9.woff2?dpl=a3ee261" as="font" crossorigin="" type="font/woff2"/>
<link rel="stylesheet" href="/_next/static/chunks/1yq7cxx2oxvx6.css?dpl=a3ee261" data-precedence="next"/>
<script src="/_next/static/chunks/turbopack-077hmtqrhcoji.js?dpl=a3ee261" async=""></script>
```

**[FEIT]** De grote RSC-flightpayload begint op r1 k66128:

```js
self.__next_f.push([1,"1:\"$Sreact.fragment\"\n2:\"/_next/static/chunks/421c_el12128q.js?dpl=a3ee261\"...
```

en de metadata-sluiting op k206657. Daarin zitten o.a. (escaped) componentnamen:

| Component | Ruw kolom | Betekenis |
|---|---:|---|
| `GameApp` | 67620 | hoofdapplicatie |
| `I18nProvider` | 74790 | locale/messages provider |
| `Providers` | 203249 | contextlaag |
| `NoticeBanner`, `ToastHost` | 203249-203700 | meldingen |
| `CampaignLayer` | 204069 | campagne/name-vote-laag |
| `PwaRoot` | 204192 | installatie-PWA |
| `AnalyticsLoader` | 204309 | analytics (lazy) |
| `ConsentCard` | 204434 | toestemmingskaart |
| `AddEmailPrompt`, `ProfilePrompt`, `EmailUpdatesPrompt` | 204545-204700 | growth/profile-prompts |
| `ScreenTracker` | 204802 | screen-tracking |
| `NavContrail` | 204880 | navigatie-animatie |

**[FEIT]** De pagina is een `initialView:"home"`-shell (k68670); de RSC-payload bevat de **volledige Engelse UI-dictionary** (~126.800 tekens na decode) maar geen zichtbare game-inhoud. De game start client-side na het laden van chunks.

**[AFGELEID]** De strategie is: SSR-shell + volledige copy in de RSC-payload + lazy chunks voor interactie. Dat geeft directe tekst/SEO en een rijke UI zonder dat de HTML self de game-logica bevat.

---

## 3. Gameplay-loop

### 3.1 De kernbelofte

**[FEIT]** Homepage (r1 k53216–58375):

> **Get as close as you can**  
> “7 targets a day. Name the closest thing you know, and every good answer climbs your plane.”  
> “7 rounds · about 3 min” (k60490)

**[FEIT]** `meta.description` (k3396): “7 prompts, one target number each. Name the answer closest to the target.”

**[FEIT]** `content.howto.intro` (RSC ruw k165618):

> “Every day at midnight New York time, Plain sets {rounds} targets. Each one is a number: a height, a price, a population, a running time. Name the thing whose real value is closest, and your plane climbs.”

**[FEIT]** `content.about.why.p1/p2` (k78100 e.v.): “how big is it?”, “You never need the exact number. You need a good feel for it, and the game rewards being close rather than being lucky.”

**UX-kern:** de speler voorspelt niet het getal, maar kiest een **bekend item uit een categorie** met een geverifieerde waarde. Dat verlaagt de drempel en maakt ook een fout antwoord leerzaam.

### 3.2 Ronde-flow

**[FEIT]** `content.howto.rules` (ruw k165871–166500), gedescaped:

- “A game is **{rounds} rounds** of **{seconds} seconds**. Each round shows a category and a target, for example: ‘Name a mountain with a summit closest to {target} m above sea level.’”
- “Type an answer from that category. Suggestions appear as you type; pick one or press Enter. Small typos are fine.”
- “Your first accepted answer is **locked in**. If we don't know an answer, or it's outside the category, we tell you why and you can try another. That doesn't use up the round, but the clock keeps running.”
- “Everyone gets the same {rounds} prompts on the same day. A full game takes about three minutes.”

**[FEIT]** Ondersteunende copy: `game.round.enterHint` = “Enter to lock in”, `game.round.spellingHint` = “close spellings count”, `game.ready.note` = “The clock starts when you tap.”, `game.reveal.outOfTime` = “Out of time”.

**[FEIT]** Afwijzingen zijn gespecificeerd in `questions.*` en `content.faq.notAccepted`:

- `"“{text}” isn't on our list. Try something else."`
- `"“{text}” doesn't count in this round. Try something else."`
- `"Which one do you mean? Type more of the name."`
- “Answers sent less than a moment apart are ignored, and after a dozen misses in one round we ask you to lock in one you know.”
- Restricties worden getoond met een chip: `content.howto.tips.scope` noemt “2020–2029 only” en “Starbucks menu only”; `game.round.coach` = “Any {noun} works. Closer = higher climb.”

**[BELANGRIJK — NIET IN DEZE BRON]** De exacte waarde van `{seconds}` voor de dagelijkse modus **staat niet in de HTML**; alleen placeholders. Evenmin staan hier de concrete voorbeeldwaarden (bijv. 6.200 m) of de numerieke bonusgroottes. `[AANNAME]` die waarden zitten in de externe chunks; ik noem ze hier bewust niet als feit.

### 3.3 Timer, zinking en round-regels

**[FEIT]** `content.howto.altitude.p2` (ruw k168199–168620):

> “While a round's timer runs, the plane sinks. The first **{grace} seconds** are free (time to read the prompt); after that you lose **{rate} m per second**, at most **{maxSink} m** in a round. Answering Denali after 12 seconds nets {climb} − {sink} = {net} m. If time runs out, you climb nothing and lose the full {maxSink} m. Altitude never drops below the runway. **The server measures the time, so the clock is the same for everyone.**”

**[FEIT]** `content.howto.altitude.p1`: “Every point climbs **{mpp} m**, so the ceiling is **{ceiling} m**.”  
**[FEIT]** `game.reveal.sinkNote`: `" ({climb} climb, {sink} lost to the clock)"`.  
**[FEIT]** `game.reveal.srGoldenClimbed`: “Golden Round, double climb: climbed {meters}{sink}.”

**[AFGELEID]** Tijd is geen losse score-modifier maar een ** negatieve kracht tijdens het denken**: snelheid kost hoogte, maar nauwkeurigheid blijft belangrijker (`tips.accuracy`: “Accuracy beats speed. One point is {mpp} m; the most you can lose to sinking in a round is {maxSink} m.”). Omdat de server de tijd meet, zijn vergelijkingen tussen spelers eerlijk; client-side optimistic UI mag niet leidend zijn.

**[FEIT]** Andere modi hebben wél expliciete seconden in de copy:
- `meta.competitive.description`: “Live 1v1 on Plain: 7 number questions, **15 seconds each**, and the higher plane wins.” (k75200 e.v.)
- `squad.how.p1`: “up to 5 tries of 10 number questions for your country, **15 seconds each**. Only your best try counts.”
- `results.competitiveAsk`: “7 number questions, 15 seconds each.”

**[FEIT]** Dagelijks startpunt is wereldwijd gelijk: `content.faq.newPuzzle` noemt “00:00, midnight New York time”, “04:00 UTC … daylight saving”, “one puzzle for the whole world” en een aftelling op de home na het spelen. De head-script Halloween-check gebruikt eveneens `America/New_York` (k5869).

### 3.4 Golden Round, Finale, estimate rounds

**[FEIT]** `content.howto.golden.p` (ruw k169518):

> “One round each day is golden: its points, including the Dialed bonus, count **double**. It's the same round for everyone, and you only find out which one it was **after you answer**.”

**[FEIT]** `content.archive.golden` = “Golden Round ×2”; `content.howto.scoring.best` = “The best possible day is {max} points: a Dialed in every round, with the Golden Round doubled.”

**[FEIT]** Finale = ronde 7: `game.round.final` = “Final round”; `content.howto` badge `perfect-finale.description` = “Land a Dialed on the Finale (**round 7**).” (r1 k114184).

**[FEIT]** `content.howto.estimate.p1/p2` (ruw k168843–169342): twee rondes per dag vragen één getal (“How many people walked on the Moon…?”, “In what year did the first iPhone go on sale?”). Invoer accepteert `2.5k`, `1.2 million`. Bij jaren: **tot 3 jaar ernaast = Close, alleen het exacte jaar = Dialed**; na elke ronde verschijnen antwoord, feit en bron. `game.estimate.*` bevat eenheden: year, percent, USD/EUR/GBP/CAD/AUD, people, km, meters, kg, km², minutes, seconds, years, kcal, mg, million/billion variants.

### 3.5 Reveal, resultaten, context

**[FEIT]** Na elke ronde toont `game.reveal`: “The answer”, “Best answer”, “Show other close answers”, “Only {percent} off”, “Climbed {meters}”, `theAnswer`, `credit`, `percentOff`, `yearsOff`, `gaugeAnswer`, screenreader-teksten zoals “You guessed {guess}; the answer is {truth}, {gap}.”

**[FEIT]** Resultaten (`results.*`, r1 k170000 e.v.) bevatten: hoogte, zones, flight log met chips per ronde, round-by-round, “Best possible climb today: {meters}”, vergelijking met gisteren, “You beat {percent} of today's players”, distributiecurve (`curvePeak`, `curveYou`), een **gelabelde** simulatie (`simulated: "Simulated players"`),XP/level/missies/badges en share-acties. De expliciete simulatie-labeling is een opvallend eerlijkheidsdetail.

**[FEIT]** Progression: `home.missions` (13 missies: 3 Close, 5 Warm, 3.000 m, 5.000 m, 4 antwoorden <10 s, Dialed, <100 m zinking, golden Close, finale Warm, 800 m klim, geen Miss, 3 Close op rij, 2 Close <8 s), `home.streak` (freezes, at risk in laatste 3 uur), `results.progress` (XP-bronnen: altitude, streak, Dialed, mission, first game).

---

## 4. Scoring en ranks

**[FEIT]** Ranks (`common.tiers`, r1 k76600 e.v.): **Dialed · Close · Warm · Cold · Miss**.

**[FEIT]** `content.howto.scoring` (ruw k167559–168000):

> “Points measure how close you are on a ratio scale, so twice the target scores the same as half the target: both are off by the same factor. A perfect answer scores **100**.”  
> `where: "where d = |ln(answer ÷ target)|, the distance on a log scale"`

**[FEIT]** `content.howto.tiers`:

| Tier | Statische beschrijving |
|---|---|
| Dialed | “Within {pct}% of the target, either way”; punten `{from}–100 + {bonus} bonus` |
| Close / Warm | “Up to {over}% over or {under}% under” (placeholder, geen getallen in HTML) |
| Cold | “Up to double or half the target” |
| Miss | “More than double or less than half, or no answer” |

**[FEIT]** Dialed-band is elders wel expliciet: `content.howto.example.outro` = “inside the **1%** band, so it's a Dialed” (k167100 e.v.) en `content.howto.estimate.p2` = “within 1% is a Dialed”. Afzonderlijke percentage-grenzen voor Close/Warm ontbreken in deze bron.

**[FEIT]** `content.faq.bestAnswer`: gelijk dichtbij = gelijke punten; bij een tie tussen twee antwoorden toont het spel “the better-known one”. `game.reveal.bestFound` = “No one could get closer.”

**[FEIT]** Hoogte-model: 1 punt = `{mpp}` m (`game.reveal` toont `{meters} climb`), plafond `{ceiling}` m, vloer = runway (0 m). `game.zones` noemt: On the runway, Over the rooftops, Low clouds, Above the clouds, Mountain air, Thin air, Above Everest, Cruising altitude. `howto.altitude.p3` geeft referenties: wolken, Everest, cruising altitude.

**[AANNAME]** De exacte formule-constant, de `{mpp}`-waarde en de numerieke Close/Warm-grenzen zijn niet uit deze HTML te halen; de log-schaal en de symmetrie zijn dat wel.

**Les voor ZERON:** log-ratio scoring is de juiste basis voor *orders of magnitude*. Voor een rare-answer variant moet je daar een tweede as aan toevoegen: **zeldzaamheid** (bijv. een verified rarity-index), anders wint altijd het populairste bekende antwoord.

---

## 5. Vraagbronnen, datakwaliteit en locales

### 5.1 Vraagbronnen

**[FEIT]** `content.about.data.p1` (ruw k154979):

> “Plain has more than **130 categories**, from box-office grosses and mountain heights to salaries, Big Mac prices and Pokémon weights, plus over **300 number questions**, dozens of them sent in by players. Every answer in every list carries a **value, the source it came from and the date it was checked**. We collect values with **scripts from one consistent source per category**, so answers in the same round are measured the same way, and we never fill values in from memory.”

**[FEIT]** Genoemde bronnen (`content.about.data.main` e.v.):

- Wikipedia/Wikidata (box office via Box Office Mojo & The Numbers; runtimes, bergen, gebouwen, bruggen, rivieren, stadions, liedjes, TV-afleveringen, gamesales, dichtheden, gebieden, recordtemperaturen, Olympische medailles, levensduur, steden, hoofdstad-coördinaten, Instagram-followers, tijdzones, talen, vlaggen)
- UN World Population Prospects; World Bank WDI; UNESCO World Heritage
- US Bureau of Labor Statistics (OEWS) voor salarissen
- The Economist Big Mac Index
- USDA FoodData Central, eigen voedingsdata van ketens, CSPI-caféïnegrafiek
- AnAge, dierenparken/wildlife agencies/Wikipedia
- CTBUH Skyscraper Center, Fortune Global 500, StockAnalysis
- PokéAPI
- afgeleide waarden (dichtheid = populatie ÷ oppervlakte; vliegtijd = great-circle × kruissnelheid), methode vermeld per categorie

**[FEIT]** `content.about.checked`: automatische check op bron, positieve waarde, juiste eenheid, botsende aliassen, voldoende antwoorden per categorie; handmatige beslissing bij conflicting sources; **“each day's puzzle is frozen once it goes live”**.

**[FEIT]** `content.sources` noemt licenties/credits: CC0, “Text and data {licence}”, Wikipedia contributors, MIT, BSD 3-Clause (PokéAPI), publiek domein (U.S. federal government), ECB reuse policy, plus een uitdrukkelijke no-affiliation/trademark-sectie (Pokémon, McDonald's/Big Mac, The Economist).

**[FEIT]** `content.submit` beschrijft een inzendingformulier: vraag (10–200 tekens), antwoord mét eenheid, bronlink (`https://`), optional fun fact (<240) en creditnaam (≤24). `[AFGELEID]` dit is de inputkant van de “dozens sent in by players”.

### 5.2 Locales / talen

**[FEIT]** `<html lang="en" dir="ltr">`, `og:locale=en`, RSC-root `locale:"en"`. De taalselector (r1 k55101) is een `<select aria-label="Language">` met **16 opties**:

| value | lang-attribuut | label |
|---|---|---|
| en | en | English (selected) |
| es | es | Español |
| de | de | Deutsch |
| fr | fr | Français |
| pt | pt-BR | Português |
| zh | zh-CN | 中文 |
| hi | hi-IN | हिन्दी |
| ja | ja-JP | 日本語 |
| ar | ar | العربية |
| pl | pl-PL | Polski |
| tr | tr-TR | Türkçe |
| hr | hr-HR | Hrvatski |
| it | it-IT | Italiano |
| nl | nl-NL | Nederlands |
| sv | sv-SE | Svenska |
| nb | nb-NO | Norsk |

**[FEIT]** `common.languageHint`: “Plain uses your browser’s language unless you pick one here.”; `common.languageAuto`: “Automatic ({name})”.  
**[FEIT]** De dictionary gebruikt **ICU MessageFormat**: `{n, plural, one {# target} other {# targets}}`, `=0 {same year}`, `{pct}`, `{meters}` en `<em>/<archive>`-tags in strings. `dir="ltr"` + `rtl:`-utilityclasses (`rtl:-scale-x-100`, `rtl:origin-right`) tonen RTL-voorbereiding voor Arabisch.

**[FEIT]** Dezelfde statische HTML bevat alleen de **Engelse** messages; andere locale-bestanden worden niet meegeleverd in deze bron. `[AANNAME]` die worden via chunks/API geladen.

---

## 6. Archive, Questions, Creators en andere pagina's

**[FEIT]** Footer-links (r1 k60962 e.v., exacte `href`s): `/how-to-play`, `/about`, `/faq`, `/archive`, `/questions`, `/creators`, `/contact` plus `/impressum`, `/privacy`, `/terms`, `/sources`. Extern: `https://www.reddit.com/r/PlayPlain/` en `https://www.instagram.com/playplaingame/` (`target=_blank rel=noopener noreferrer`).

### Archive
**[FEIT]** `content.archive`: “Every finished day of Plain: its seven targets, the best answers in our lists and their real values. **A day appears here once it's over, never while it can still be played.**” Verder: “Points are before the Dialed bonus and the Golden Round's ×2”, labels `Round {n}`, `Golden Round ×2`, `Finale`, `Target`, `The answer`, `Best answer`, `Also close`, `Your answer`, `Out of Time`, `You didn't play this day`, `Your groups on this day`. `meta.archiveDay.title` = “Plain #{number} answers ({date}) · Plain”.  
**[FEIT]** `content.faq.archive`: oude puzzels zijn **zichtbaar maar niet herspeelbaar voor score**, “so every day's results stay comparable”.

### Questions
**[FEIT]** `content.questions`: “Every question from past Plain puzzles, with the real answer. Today's questions appear here once the day is over.” Velden: `The answer`, `The best answer`, `Also on the list`, `Source: {source}`, `Sent in by {name}`, `Asked in Plain #{number} on {date}.`, `More questions`, `All questions`.

### Creators
**[FEIT]** `content.creators`: “Post a TikTok or Instagram video of you playing Plain. When it reaches {views} views, we pay you {reward}.” Stappen: film met `{hashtag}`, bereik `{views}` echte views, mail bewijs, betaling binnen 3 maanden. Rules: budget `{rewards} × {reward}` (`{budget}`), `≥18` of ouder, label `#ad`/`#werbung`, video 30 dagen publiek, claim binnen 90 dagen, geen gekochte views, proof via platform-analytics. **Numerieke waarden van `{views}`, `{reward}` en `{budget}` ontbreken in deze HTML.** `[AANNAME]` ze worden server/chunk-side ingevuld.

**[FEIT]** `campaign.*` (r1 k195000 e.v.) beschrijft een aparte groeicampagne: “Plain is getting a new name”, teams **Qish** vs **Jetish**, één stem per speler, {n}/{max} entries, prijzen (o.a. “20 gift cards”, “iPhone Duo or AirPods” in share-copy), e-mailverificatie met 7-dagen-link, QR/WhatsApp/Instagram-story sharing en `plain.game` in og-desc. `content.about.who.official` noemt zowel `playplain.app` als `plain.game`; de footer zegt alleen `playplain.app`. Dat is een **statische inconsistentie in de copy**.

**[FEIT]** Verder aanwezig in de dictionary, maar zonder literal route in deze HTML: `site.menu.logbook` (“Logbook”), `site.menu.friends`, `site.modes` (Daily/Competitive/Squad), `hangar.*` (planes/skins), `vote.*`, `poll.*`, `groups.*` (Slack/Teams webhooks), `battle.*`, `party.*`, `squad.*`, `auth.*`, `profile.*`, `results.reminder.*`, `meta.submit`.

---

## 7. Routes

**[FEIT — directe `<a href>`]**: `/`, `/profile`, `/how-to-play`, `/about`, `/faq`, `/archive`, `/questions`, `/creators`, `/contact`, `/impressum`, `/privacy`, `/terms`, `/sources`.

**[FEIT — mode-detectie in de head-script, r1 k5045]**:

```js
new RegExp("^/(?:competitive(?:/|$)|battles$|b/)").test(p) ? "competitive"
: new RegExp("^/squad(?:/|$)").test(p) ? "squad" : "daily"
```

Daaruit volgen expliciet de route-patronen `/competitive…`, `/battles`, `/b/<id>` en `/squad…`. De drie bijbehorende `<div data-mode="daily|competitive|squad">` lagen staan in de achtergrond-scene; CSS verbergt de niet-actieve lagen.

**[AFGELEID — niet als literal pad in de bron]** op basis van copy/meta: `/submit` (formulier), `/logbook`, `/friends`/`/groups`, `/hangar`, `/vote`, `/poll`, `/archive/<nummer>` (`meta.archiveDay`), `/profile`. **Deze paden zijn een inferentie, geen bewezen routes.**

**[FEIT]** 404-val: in de RSC-payload staat de standaard Next.js “404: This page could not be found.” plus `errors.notFound` copy: “Way off the chart — This page doesn't exist. Today's puzzle does, though.”

---

## 8. Opslag, state en synchronisatie

**[FEIT — de enige twee literal storage keys in de bron]**, r1 k5306 en k5727:

```js
localStorage.getItem("dialed:theme") === "light" ? "light" : "dark"
localStorage.getItem("dialed:game:v1")
if (g && g.indexOf('"history":[{') > -1) d.setAttribute("data-returning","1")
```

Consequenties:

- namespace **`dialed:`** (legacy-naam ondanks productnaam Plain), met versie `:v1` in de game-key;
- opgeslagen game-state is JSON met minstens een `"history"`-array;
- `data-returning="1"` wordt door CSS gebruikt om de hero op kleine schermen te verbergen: `max-lg:[html[data-returning]_&]:sr-only` (r1 k57529); terugkerende spelers zien direct “Today's flight”;
- thema: alles behalve `"light"` → dark; `theme-color` wordt per modus bijgewerkt naar `#0b0d12` (dark) of `#f5f6f8` (light).

**[FEIT]** `content.faq.account`: “your games, streak and progress are kept with a **cookie** on this device”; account via username/password (zonder e-mail) of Google, 16+. Dat is een tweede, naast `localStorage` genoemde opslagvorm. `[AFGELEID]` waarschijnlijk combinatie van localStorage voor UI-state en cookie/server-session voor guest-progress, maar de cookie-naam staat **niet** in deze bron.

**[FEIT]** Sync-copy (`game.sync`) is opvallend expliciet:

- “Today's puzzle was updated — loading the latest version.”
- “That puzzle has closed.”
- “This flight was already finished in another tab or on another device.”
- “Picked up from another tab or device: round {n} of {total}.”
- “Synced with your account: this flight continues from round {n} of {total}.”
- “This device's session was reset, so this flight starts over.”

**[FEIT]** Offline/retry (`game.submit`): “You're offline — the clock is still running”; “This round goes to the server as soon as you're back”; “Couldn't sync this game with the server”; “Too many tries just now.”  
**[AFGELEID]** Er is een server-autoritatieve, versioned game-state met cross-device/cross-tab reconciliatie; de client doet optimistic updates met retry.

**[AANNAME]** Keys voor consent, analytics-opt-in, reminders en aankopen zijn niet in deze HTML zichtbaar en worden niet gegokt.

---

## 9. Analytics, ads en groei

**[FEIT — consent-copy, r1 k184033]**:

```text
consent.aria  = "Analytics"
consent.title = "Help us make Plain better?"
consent.body  = "With your OK we use Google Analytics to see which questions people enjoy and where they get stuck. No ads tracking, nothing personal. You can change it any time in Settings."
consent.deny / allow = "No thanks" / "Allow"
```

**[FEIT]** In de componentlijst: `AnalyticsLoader` (k204309), `ConsentCard` (k204434), `ScreenTracker` (k204802). Settings-copy: `analyticsSub` = “Helps us see how the game is played. Nothing personal.”

**[FEIT — advertenties]** `content.faq.free`: “Plain is free to play and shows no ads.” / “There is nothing to buy: streak freezes are earned, never sold.” `content.about.who`: “Plain is free to play and shows no ads.” `site.advertisement` bevat wel de string `"Advertisement"`; `creators.rules.label` vraagt creators hun video als advertising te labelen. **Er komt geen enkel ad-netwerk-URL of ad-script in de bron voor** (geen `adsbygoogle`, `googletag`, `adsense`, `adsterra`). `[AFGELEID]` `site.advertisement` is waarschijnlijk een gereserveerde label-slot of campagne-placeholder, geen bewezen advertising integration.

**[FEIT]** Groei zit in plaats daarvan in: creator-beloningen, de name-vote-campagne, share-resultaten, uitdagingen/group invites, Reddit/Instagram, herinneringen (met de expliciete belofte “nothing between 22:00 and 08:00”) en install-prompts.

---

## 10. Netwerk en API-endpoints

**[FEIT — aanwezige URL's]** De enige absolute URL's in de bron zijn:

- `https://playplain.app` / `https://playplain.app/` (canonical, schema, og)
- `https://schema.org` (JSON-LD `@context`; geen fetch-bewijs)
- `https://www.reddit.com/r/PlayPlain/`
- `https://www.instagram.com/playplaingame/`

Daarnaast relatieve asset-URL's: `/_next/static/media/*.woff2`, `/_next/static/chunks/*.css`, `/_next/static/chunks/*.js`, `/manifest.webmanifest`, `/favicon.ico`, `/icons/*`.

**[FEIT — negatieve bevinding]** Er staan **geen** `/api/...`-paden, `fetch(`, `XMLHttpRequest`, WebSocket-, measurement- of analytics-endpoint-URL's in de HTML. Evenmin een GA-measurement-ID. `[AANNAME]` die zitten in de externe chunks; ze zijn met deze opdracht niet onderzocht.

**[AFGELEID uit copy — geen endpoint-bewijs]** De client moet minstens praten met: puzzle-load (“Couldn't load today's puzzle”), answer-submit en rate-limiting, game-sync, account/auth (Google + username/password), leaderbord/percentiel, reminder/push-instellingen, autocomplete-suggesties, e-mailverificatie voor de campagne en optionele Slack/Teams-webhooks. De exacte routes, methoden en payloads zijn **onbekend**.

---

## 11. Visuele stijl, typografie en UX-details

### 11.1 Themas en kleuren

**[FEIT]** Dark default `#0b0d12`, light `#f5f6f8`; `color-scheme: dark light`. De HTML gebruikt semantische tokens als `bg-bg`, `text-fg`, `text-muted`, `text-subtle`, `text-overline`, `text-caption`, `text-body`, `text-headline`, `text-title`, `text-hero`, `bg-accent`, `text-accent-ink`, `text-accent-fg`, `surface-e2`, `bg-hairline`, `bg-hairline-strong`, `ring-line`, `link-quiet`.

**[FEIT]** 67 `color-mix(in oklab, …)`-uitdrukkingen en 43+ `light:`-varianten: de scene wordt niet met vaste hexwaarden maar met **afgeleide, perceptueel gemixte tokens** opgebouwd. Voorbeelden (r1 k6494 e.v.):

```html
[--sky-hills:color-mix(in_oklab,var(--sky-horizon-runway)_70%,var(--bg))]
light:[--sky-hills:color-mix(in_oklab,var(--sky-peak)_38%,var(--sky-horizon-runway))]
[--sky-window:color-mix(in_oklab,var(--golden-fill)_70%,white)]
```

**[FEIT]** Sky-tokens: `--sky-zenith-{runway,low,above,mountain,thin,cruise}`, `--sky-horizon-*` (dezelfde zes + mountain), `--sky-peak`, `--sky-sun`, `--sky-rim`, `--sky-cloud`, `--sky-sea`, `--sky-city`, `--sky-ground`, `--sky-asphalt`, `--sky-taxi`, `--sky-lamp-o`, `--trail-streak`, `--zone-close`, `--zone-sharp`, `--golden-fill`. Dat zijn zes hoogte-zones die direct aan de altitude-zones uit §4 gekoppeld zijn.

### 11.2 De achtergrond-scene

**[FEIT]** Direct na `<body>` staat een decoratieve laag (r1 k6494):

```html
<div role="img" aria-label="Altitude 0 m" dir="ltr" class="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh overflow-hidden select-none">
```

Daarin: de meeste van de 19 `background:linear-gradient`-uitdrukkingen in de HTML, plus het grootste deel van de **218 `<circle>`-elementen** van het document — met deterministische `cx`/`cy`/`r`/`opacity` (sterrenhemel, `light:hidden`) — en daarnaast zon, heuvels, skyline, runway, taxiway, lampen, ramen en contrail. Drie modus-lagen (`data-mode="daily"`, `"competitive"`, `"squad"`) worden via CSS gewisseld. De zichtbare hoogte is dus **een infographic**: de UI vertelt niet alleen “Altitude 1.200 m”, de hele achtergrond verandert mee.

**[FEIT]** Easter egg: head-script (k5869):

```js
new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York"}).format(new Date())
if (d.slice(5)==="10-31" || /[?&]event=halloween(&|$)/.test(location.search))
  document.documentElement.setAttribute("data-event","halloween")
```

De h1 bevat een `pumpkin-dot`-SVG met oranje ellipsen (r1 k57700); `home.halloween` = “Happy Halloween”. Het is dus een datum- én query-gestuurde variant, statisch voorgerenderd.

### 11.3 Layout, typografie, interactie

**[FEIT]** Responsive shell (r1 k55100 e.v.): `main` = `mx-auto w-full max-w-md px-4 md:max-w-5xl md:px-8 xl:max-w-6xl`; op `lg` een 3-kolom grid `minmax(0,1fr) 1px minmax(0,20rem)` met `lg:surface-e2` en een hairline-divider. Mobiel: hero links, CTA onderaan; desktop: CTA in de rechterkolom.

**[FEIT]** De CTA (r1 k59747) is groot en expliciet:

```html
<button type="button" class="… bg-accent text-accent-ink min-h-16 px-8 text-headline w-full h-16 …">
  <span>Play</span><span class="text-caption opacity-70">7 rounds · about 3 min</span>
</button>
```

**[FEIT]** Typografie is utility-class based: `text-overline`, `text-caption` (18×), `text-body`, `text-headline` (3×), `text-title`, `text-hero` met dynamische clamp `lg:[--type-hero:clamp(3.5rem,13.4cqi,6.75rem)]` (k57529). Eén voorogeladen WOFF2; de Haarste egale definitie (font-family, weights, letterspacing) zit in de externe CSS en is **niet** in deze bron. `[AANNAME]` het is een custom display face voor de hero + een systeem/UI-face voor body; dat is niet aantoonbaar.

**[FEIT]** Toegankelijkheid: `aria-label="Open menu"`, `aria-haspopup="dialog"`, `aria-expanded="false"`, `aria-live="polite" role="status"` (twee live regions), `sr-only`-teksten, `min-h-11` touch-targets op footerlinks, `role="img"` + `aria-label` op de scene, `focusable="false"` op decoratieve SVG's, `srAnswer`/`gauge*` screenreader-copy, `dir=ltr`+`rtl:`-variants.

**[FEIT]** Instellingen in de dictionary: `sound`, `reducedEffects` (“Calmer animations, same information”), `haptics`, `imperial`/`metric` units, `lightTheme` — toegankelijkheid en sensorische voorkeuren zijn productniveau, niet experimenteel.

**[FEIT]** Animatie meetsbaar: `enter-item` met `style="--enter-i:1..4"`, `animate-pulse`-skeleton, `--vvh`, `--streak-o`, `--enter-i`, progress-bar in de top (`transform:scaleX(0)` met `linear-gradient` en `color-mix`), `NavContrail`.

---

## 12. Concrete lessen voor ZERON

1. **Neem de belofte één zinlang.** PLAIN zegt “Name the closest thing you know”. ZERON zou kunnen zeggen: *“Noem het zeldzaamste signaal dat nog dichtbij de frequentie ligt.”* Houd de kern zichtbaar in `<title>`, meta description, hero én CTA; alle vier zeggen bij PLAIN hetzelfde.

2. **Eén wereldwijde, bevroren puzzel per dag.** Fix het cutoff-tijdstip expliciet (PLAIN: 00:00 New York, FAQ: 04:00/05:00 UTC), vries de puzzel bij livegang en maak oude dagen alleen leesbaar. Dat voorkomt replay-scorevervuiling en maakt leaderboards vergelijkbaar. Voor ZERON: kies één UTC-cutoff en publiceer die in de FAQ.

3. **Log-ratio scoring + een tweede as: zeldzaamheid.** `d = |ln(answer ÷ target)|` is robuust voor waarden van 10 tot 10⁹ en beloont half/double gelijk. Voor rare answers voeg je een transparante rarity-weging toe (bijv. `score = accuracy × f(rarity)`) en leg je die in de UI uit. Zonder die tweede as is “rare” weinig meer dan een smaaklabel.

4. **Maak tiers concreet en beperk het aantal.** Dialed/Close/Warm/Cold/Miss zijn vijf niveaus, direct gekoppeld aan kleur en zone. ZERON kan `SIGNAL / ECHO / STATIC / NOISE` gebruiken, maar publiceer de banden (PLAIN: 1% voor Dialed; log-schaal; Cold = 2×/½; Miss = daarbuiten). Verborgen placeholders zijn slecht voor vertrouwen.

5. **Golden Round als asymmetrische spanning.** Eén ronde, geheim tot ná het antwoord, punten incl. bonus ×2. Dat creëert “elke ronde telt”. Voor ZERON: een “BLACK ICE”-ronde met ×2 zeldzaamheidsfactor, maar pas onthullen na lock-in.

6. **Server-measured timer + grace + bounded penalty.** De combinatie “eerste seconden gratis”, “m/s zinking”, “maximale zinking”, “vloer op 0” en “server klok” is een uitstekend eerlijkheidsontwerp. Neem ook de offline-retry-copy over: de klok loopt door, de submit wordt later gesynchroniseerd.

7. **Afwijzingen kosten geen ronde, maar wel tijd.** Suggesties, alias/punctuatie/typo-tolerantie, ambiguïteitsmelding (“Which one do you mean?”), scope-chip en rate limits vormen samen een vriendelijke maar fraudebestendige invoer. Voor rare answers is dit cruciaal: maak een *curated whitelist* met verified rarity in plaats van vrije tekst zonder bron.

8. **Toon bewijs in de reveal.** Per antwoord: echte waarde, bron, gecheckte datum, “best answer”, “no one could get closer”, fun fact. PLAIN doet dit consequent. ZERON: toon ook de rarity-index en waarom een antwoord als zeldzaam geldt.

9. **Bouw een publiek archief en een vragenindex.** `/archive` met “zichtbaar ná afloop, niet herspeelbaar” en `/questions` met bron + inzender zijn tegelijk content-SEO, transparantie en community-erkenning. Gebruik `Plain #{number} answers ({date})`-achtige titles.

10. **Versioneer opslag vanaf dag 1.** `dialed:game:v1` + `dialed:theme` + `history`-array + `data-returning` zijn kleine, goedkope keuzes met grote UX-winsten. ZERON: `zeron:game:v1`, `zeron:theme`, `zeron:prefs`; schrijf migraties en laat de SSR-shell de returning-state lezen.

11. **I18n als systeem, niet als vertaling achteraf.** 16 locale-opties, browser-automatic + expliciete override, ICU plurals, RTL-utility's, geneste tags in strings. ZERON moet vanaf het eerste scherm `{n, plural, …}` en `{meters}` gebruiken; cyberpunk-neon werkt ook in het Arabisch/Hindi.

12. **Consent-first analytics, geen ads.** PLAIN vraagt expliciet toestemming voor Google Analytics, belooft “no ads tracking, nothing personal” en zegt zelfs geen advertenties te tonen. ZERON: meet funnel en drop-off per ronde met opt-in, label simulaties, en vermijd ad-trackers die het vertrouwen van een niche-publiek breken.

13. **PWA is de default, niet de bonus.** Manifest, icons, `viewport-fit=cover`, veilige areas, install-toasts per platform, herinneringen met nachtstilte. Een dagelijks spel leeft van terugkeer; PLAIN optimaliseert daar sterker op dan op virale_once content.

14. **Visuele identiteit via tokens + lagen, niet via plaatjes.** PLAIN bouwt een altitude-wereld uit CSS-variabelen, `oklab`-mixen en deterministische SVG's; modi wisselen via `data-mode`. ZERON kan hetzelfde doen met `data-district`/`data-layer`: neon-grids, datastromen, scanlines en signaalsterkte in plaats van zon/wolken, inclusief dark/light en `prefers-reduced-motion`.

15. **Community als game-mechaniek.** Name vote met teams, creator-rewards, groepsstreaks en challenges zijn allemaal *return loops* buiten de kernpuzzel. ZERON zou spelers kunnen laten stemmen over de volgende “rare category” — met dezelfde duidelijke regels (budget, einddatum, earnable freezes, geen betaalde voices).

16. **Houd de shell schlank.** 205 KB HTML is vooral decoratieve SVG + volledige copy in de RSC-payload. Neem de techniek over (direct leesbare tekst, lazy game-chunks), maar bewaak de payload: voor ZERON is een kleinere first paint met één scene-laag waarschijnlijk beter dan 218 sterren in de HTML.

---

## 13. Open vragen / niet uit deze bron te bepalen

- Exacte dagelijkse seconden per ronde, `{mpp}`, `{ceiling}`, `{grace}`, `{rate}`, `{maxSink}`, Dialed-bonus, Close/Warm-grenzen en `{max}` punten.
- Concrete voorbeeldwaarden in de worked example (de placeholders zijn niet ingevuld in de HTML).
- API-routes, request/response-shapes, GA-measurement-ID, consent-key, cookie-naam.
- Inhoud van de externe CSS (font-family, weights, echte breakpoint-regels) en JS (feitelijke scoring-implementatie).
- Numerieke creator-rewardwaarden `{views}`, `{reward}`, `{budget}` en campagne-einddatum.
- Of `/submit`, `/logbook`, `/hangar`, `/vote`, `/poll` echte routes zijn (alleen copy aanwezig).

**Conclusie:** PLAIN is een sterk voorbeeld van *earned closeness*: één dagelijkse, bevroren puzzel; log-schaal scoring; zichtbare bronnen; server-tijd; rijke maar beheerste progressive layer; en een visuele metafloor (de plane) die de score fysiek maakt. Voor ZERON ligt de grootste kans in het toevoegen van een **verifieerbare zeldzaamheids-as** aan die formule, zonder de eenvoud van “noem het dichtstbijzijnde ding dat je kent” te verliezen.
