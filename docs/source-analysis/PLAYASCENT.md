# ASCENT — technisch reverse-engineering rapport

**Doel:** statische analyse van de single-file site `/tmp/opencode/playascent.html` (3.405.541 bytes).
**Bron van de game-logica:** de 4e `<script>` (HTML-regel 216 t/m einde), gekopieerd naar `analysis/ascent-inline-3.js` (994 regels). HTML-regel `N` ≈ JS-regel `N-215` (bijv. `localStorage`-constantes: HTML 1097 = JS 882).
**Methode:** uitsluitend statisch. De site is **niet** uitgevoerd, er is geen DOM/browser gesimuleerd en er zijn geen network calls gedaan. Aantallen zijn verkregen door regex-gebaseerde extractie van literal data uit de JS (het script `/tmp/opencode/count_ascent.py`) en het statisch narekenen van de filterpredicaten — niet door de applicatiecode te draaien.
**REA cross-check:** `analysis/ascent-rea-evidence.json` / `ascent-rea-summary.json` (eerdere `npx -y rea-agents@latest analyze-javascript-application` run op `analysis/rea-input/`: 4 JS-bestanden, 63.961 bytes, 7.496 AST-nodes, 0 parse-fouten, 15 findings, 3.014 semantic unknowns). REA bevestigt de statische aard (geen renderer/entrypoints/requests gevonden; "JavaScript and HTML were parsed as inert text"). De gedetailleerde conclusies hieronder komen uit directe codelezing; REA's generic graph voegt hier niets contradictories aan toe.

---

## 1. Architectuur Overzicht

De game is één IIFE met `'use strict'` (`ascent-inline-3.js:1-3`) en globale `$ = id => document.getElementById(id)`. Er is geen bundler, framework, build-step of serverlogica. Afbeeldingen zijn als `data:image/...;base64` in de CSS ingebed (vandaar de ~3,4 MB).

Script-tags in de HTML, in volgorde:

| # | HTML-regel | Inhoud |
|---|---|---|
| 1 | 10 | `window.ASCENT_ADS={client:'ca-pub-9868427903124193',slot:''};` |
| 2 | 11 | `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=...">` — **wordt altijd geladen**, ook vóór/zonder analytics-consent (comment regel 9: "site verification … Auto Ads stays disabled"); met leeg `slot` wordt geen adunit gerenderd. |
| 3 | 13 | `window.ASCENT_ANALYTICS={measurementId:'G-G987KT8K4C'}; window.dataLayer=...; function gtag(){dataLayer.push(arguments);}` (stub; echte GA-script wordt pas later geïnjecteerd). |
| 4 | 216 | Volledige game in IIFE. |

State-machine: `state ∈ {'intro','play','finish'}` (`show(name)`, JS 958; `body.className='state-'+name`). `lockAnswer` weigert invoer als `state!=='play'` (JS 977). De CSS bevat nog `state-result`-regels, maar `show()` kent geen `result`-state: de "resultaat"-fase is vervangen door de `flightToast` (`flashResult`).

Hoofdvariabelen (JS 881-883): `deck, round, score, history, deadline, timerId, speedId, advanceTimer, toastTimer, toastHideTimer, unrecognized, questionBag, lastPlayed, bagLoaded`, plus `completedFlights, lastDebriefAt, adScriptPromise, analyticsConsent, analyticsLoaded`.

---

## 2. Spelmechanieken

### 2.1 Flow per vlucht

- `start()` (JS 963): reset `round=0, score=0, history=[]`, `deck=chooseDeck()`, analytics `game_start`, `show('play')`, `playRound()`.
- `playRound()` (JS 962): toont `deck[round]` in `#promptKind`, `#promptText`, `#hintText`; `roundText = "NN / 07"`; wist invoer/border; `progress()` tekent 7 dots (`.done/.current`); zet `deadline = performance.now()+25000`; `tick()` direct + `setInterval(tick,100)`; focus input na 100 ms.
- `lockAnswer(raw, timedOut=false)` (JS 976-989): match antwoord, score += punten (cap 700), `history.push({answer, points})`, bepaalt gepasseerde landmarks, toont toast, `round++` of `end()` bij `round===6` (7e/Laatste vraag), `ascend()` bij score > 0.
- `end()` (JS 990): `recordCompletedFlight()`, analytics `game_complete`, `show('finish')`, debrief/ad, rank + best score.
- `beginFlight()` (JS 948) = alias voor `start()`, gekoppeld aan zowel `#startButton` als `#replayButton` (JS 991).

**Belangrijke UX-regel:** een onbekend antwoord is géén fout. Bij `!answer && !timedOut` (JS 979) wordt de timer **niet** gestopt; de hint wordt rood (`'Not on our list — try another before the timer runs out.'`), de input geselecteerd en de speler mag opnieuw proberen tot de timer afloopt. `unrecognized` wordt gezet maar verder nergens gebruikt (dode variabele; alleen reset op 988). `advanceTimer` is gedeclareerd en gecleared maar nooit gezet (dode code).

### 2.2 Timer

- 25 seconden per vraag: `deadline=performance.now()+25000` (JS 962), `const left=Math.max(0,deadline-performance.now())` (JS 960).
- Weergave: `Math.ceil(left/1000)` 2-cijferig in `#timer`; balk `timeFill.style.transform='scaleX('+left/25000+')'`; `.urgent` op timer + `.time-track` bij `left<6000` (6 s).
- Aflopen: `stopTimer(); lockAnswer('',true)` → 0 punten, "TIME'S UP", automatisch volgende vraag. Geen time-bonus of aftrek.
- `stopTimer()` (JS 959) cleart de interval; `end()` en `start()` roepen hem ook aan.

### 2.3 Prompt-pool en aantallen (statisch berekend)

De pool wordt in twee lagen opgebouwd.

**Laag A — "featured" handgecureerde prompts (`banks` vóór `featuredCount`)**

- `make(category,prompt,raw,hint)` (JS 22-24) parset regels `name|points|alias1,alias2`; punten zijn expliciet (25…100).
- **29** `make(...)`-blokken (JS 26-649), o.a. presidents, eilanden, wolken, manen, Shakespeare, pasta.
- `addNames(category,prompt,names,hint)` (JS 651-654): punten = `min(100, 25+round(75*(i/(n-1))^1.25))` — dus positie in de lijst = zeldzaamheid (vooraan="bekend", achteraan="rare").
  - **62** banken uit `for(const [letter,names] of Object.entries(...))`-loops over `countryLetters` (13), `capitalLetters` (8), `elementLetters` (8), `fruitLetters` (6), `animalLetters` (5), `birdLetters` (4), `instrumentLetters` (4), `constellationLetters` (3), `vegetableLetters` (4), `treeLetters` (3), plus `planetMoons` (4).
  - **34** directe `addNames(...)`-calls (2× gemstenen, 2× staten, 30 hand-picked zoals "land dat de FIFA World Cup won", "grens aan Duitsland", "dier in Chinese dierenriem", …).
- Totaal **125 featured banken / 1.667 antwoorden** (statische telling: 29 `make` + 62 loop-`addNames` + 34 directe `addNames`). `featuredCount=banks.length` wordt op JS 791 gefreeze **vóór** de gegenereerde banken worden toegevoegd.

**Laag B — gegenereerde, maar offline controleerbare prompts (`addCheckable`, JS 843-879)**

- 16 `corpora` (JS 797-814): per "ding-familie" een curatielijst: COUNTRIES/a country (191 uniek na `uniqueNames`), CAPITALS/a capital city (173), SCIENCE/a chemical element (118), ANIMALS/an animal (147), BIRDS/a bird (51), FOOD/a fruit (84), FOOD/a vegetable (36), MUSIC/a musical instrument (42), GEMSTONES/a gemstone (34), LOOK UP/a constellation (32), OUT THERE/a moon (67), NATURE/a tree (46), HISTORY/a U.S. president (45), CULTURE/a Shakespeare play (28), FOOD/a pasta shape (22), LOOK UP/a cloud type (17). Pools komen uit `poolFromGroups`, `poolFromPrompt`, `extraFruits/extraAnimals/allElements/moreCapitals` en extra literallijsten; `uniqueNames` de-dupliceert op accented-insensitive alnum-key.
- `addCheckable` generating patterns:
  - `with the letter X in its name` voor `x ∈ aeioursntlcmbgkvyz` (18 letters);
  - `ending in X` voor alle 26 letters;
  - `with no X in its name` voor `aeiost`;
  - `whose name has at least two words`, `whose name is one word`, `with a double letter in its name` (`/([a-z])\1/`);
  - `with at least {8,10,12} letters`, `with fewer than {5,7} letters`;
  - `with both X and Y in its name` voor alle paren uit `aeioprstlmn` (55 combinaties);
  - `starting with X and ending in Y` voor `abcmspt × aensy` (35 combinaties).
- Guardrails: `existingPrompts` (toLowerCase) voorkomt duplicate prompt-teksten over alle banken; `valid.length<6` → prompt wordt verworpen; elke prompt krijgt een `family` (bijv. `'contains-letter'`, `'two-letters'`, `'ends-letter'`).
- Statisch resultaat: **1.133 gegenereerde banken / 23.993 antwoordregels**, verdeeld als: two-letters 654, contains-letter 228, avoids-letter 93, ends-letter 54, long-name 39, short-name 19, one-word 15, double-letter 12, two-words 11, first-and-last 8.
- **Totaal: 1.258 banken, 25.660 antwoordregels.** Commentaar JS 789-790: "*combination space is large, but it is deliberately finite: no fake AI scoring*" — alle antwoorden komen uit vaste, vooraf gecontroleerde lijsten.

### 2.4 Vraagselectie en anti-herhaling (`chooseDeck`, JS 890-924)

1. `ids = banks.map((_,i)=>i)`; bij de eerste call wordt `ascent-question-bag-v5` geladen (`{bag,last}`), met validatie: alleen `Number.isInteger(i) && i>=0 && i<banks.length`, via `new Set` ontdubbeld. Bij afwezigheid/leeg: `questionBag = shuffle(ids.filter(i=>!lastPlayed.includes(i)))`.
2. while `chosen.length<7`:
   - lege bag → opnieuw vullen met ongebruikte, niet-zojuist-gespeelde indices.
   - `unused = !chosen.includes(i) && !lastPlayed.includes(i)`.
   - **Eerste slot is gegarandeerd "featured"**: `desired = chosen.length===0 ? available.filter(i=>i<featuredCount) : available.filter(i=>i>=featuredCount)`; alleen als `desired` leeg is blijft de volledige `available` over. Dus per vlucht exact 1 handgemaakte + 6 wordplay-vragen.
   - **Familie-anti-herhaling** via `familyOf(item)` (JS 889): `item.family` voor gegenereerde vragen; voor featured vragen wordt de prompt genormaliseerd (`starting with [A-Z]\.` → `starting with *.`, `of (Jupiter|Saturn|Uranus|Neptune)\.` → `of *.`), zodat alle "Name a country starting with X."-vragen één familie vormen. Voorkeursvolgorde: `fresh` (niet in `lastPlayed`, niet in `chosen`) → `different` (niet in `chosen`) → `available`.
   - **Categorie-balancing**: `score = frequency[category] / (1 + 2.3*used[category])`; kies de categorie met de hoogste score (`frequency` = kandidaten in `available`, `used` = al gekozen). Daarna `questionBag.splice(pos,1)`.
3. `lastPlayed=chosen`, persist `{bag:questionBag,last:lastPlayed}`, return `chosen.map(i=>banks[i])`.

`shuffle` is Fisher–Yates met `Math.random()` (JS 888). `bagLoaded` zorgt dat de localStorage maar één keer per paginalading wordt gelezen. Beperking: `lastPlayed` bevat alleen de **vorige** vlucht; over meerdere vluchten kunnen vragen terugkomen zodra de bag leeg raakt. Er is geen "nooit meer herhalen"-garantie.

---

## 3. Scoring, zeldzaamheid, naamdherkenning, typo-correctie

### 3.1 Score

- Antwoordpunten 25-100; `score = Math.min(700, score + answer.points)` (JS 981); geen aftrek; timeout = 0. `hudScore`/`finalScore` tonen `padStart(3,'0') + ' / 700'`.
- Toast-labels (`flashResult`, JS 968): `earned>=95 → '160 IQ ENERGY'`, `>=80 → 'DEEP CUT'`, `>=60 → 'NICE PULL'`, anders `'ANSWER LOCKED'`; `corrected → 'ANSWER CORRECTED'`; timeout → `'TIME’S UP'`.
- Rank op finish (JS 990): `>=610 '160 IQ ENERGY'`, `>=470 'GALAXY BRAIN'`, `>=300 'BIG BRAIN ENERGY'`, anders `'JUST GETTING STARTED'`. Koptekst gebruikt andere drempels: `>=605 'YOU WENT WAY OUT.'`, `>=290 'THE SKY WAS NOT THE LIMIT.'`, anders `'THE SKY IS STILL WAITING.'` — kleine inconsistentie tussen rank en copy.

### 3.2 Rarity-model (alleen offline data, geen AI)

- `rarity` Map (JS 820-825): voor elk antwoord in `banks` geldt `rarity.set(nameKey(name), min(bestaand, answer.points))` — de **laagste** eerder toegekende score wint; `knownAliases` verzamelt aliases per canonical naam.
- Extra ranking voor letter-groepen (JS 826-828): `33 + round(65*(i/(n-1))^1.3)` op basis van de positie `i` binnen elke `X:'a;b;c'`-regel.
- Harde overrides (JS 829-831): `familiarCountries` → `min(42, …)`, `rareCountries` (Nauru, Tuvalu, Palau, Micronesia, …) → **96**, 12 elementen (oxygen 27, iron 28, gold 30, … uranium 49) → vaste lage waarden.
- `rarityOf(name, thing)` (JS 842): land-specialisaties via `rareCountries`/`familiarCountries`, anders `rarity.get(key) ?? min(93, 59 + cleanLetters(name).length*1.35)` — **langere namen = zeldzamer** als fallback.
- `addCheckable` (JS 847-853) sorteert de geldige antwoorden op `rarityOf` (dan `localeCompare`); punten = `25 + round(75 * (((first+last)/2)/(n-1))^1.18)` waarbij `first/last` de indexen van dezelfde rarity-waarde zijn (gelijkwaardige antwoorden delen een gemiddelde rang). Aliases van `knownAliases` en `extraAliases` worden overgenomen, maar aliases die op een andere canonical antwoordkey normaliseren worden verwijderd (ambiguiteitsvermindering).
- `extraAliases` (JS 832-841): USA/US/United States of America, UK/Britain, Ivory Coast, Czech Republic, Swaziland, East Timor, Türkiye, aluminium, …
- `nameKey` (JS 818) = lowercase + NFD + diacritica verwijderen + niet-`[a-z0-9]` verwijderen; `cleanLetters` (JS 817) idem maar behoudt alleen letters.

### 3.3 Naam-herkenning en typo-correctie (`norm`, `variants`, `editDistanceOne`, `findAnswer`; JS 884-887)

- `norm(s)`: lowercase → NFD/diacritica weg → `&` → `' and '` → niet-`[a-z0-9 ]` naar spatie → whitespace collapse → trim → verwijder voorvoegsel `the|a|an `. Voorbeeld: `"The Côte d'Ivoire"` → `"cote d ivoire"`.
- `variants(s)`: geeft naast `n` ook `ies→y`, `es→` (e.g. `boxes→box`), `s→` (meervoud/enkelvoud). Zowel invoer als aliassen worden hiermee vergeleken (`findAnswer` doet een intersectie van variant-sets).
- Exacte/alias-match: `answers.find(a => [a.name,...a.aliases].some(alias => variants(alias).some(v => keys.includes(v))))` — de volgorde van `answers` bepaalt welke match wint.
- Fuzzy fallback: alleen als `norm(text).length >= 5` en **exact één** antwoord binnen "1 edit" ligt; `editDistanceOne` accepteert substitutie, insertie, deletie **en transpositie van twee aangrenzende tekens** (Damerau-achtig). Bij 0, 2 of meerdere matches: `null` (geen gok).
- `corrected = Boolean(answer && norm(raw)!==norm(answer.name))` (JS 978): puur cosmetisch — leidt tot "ANSWER CORRECTED" + `Accepted as <canonical name>.` (JS 971); geen andere score of melding. Ook het weglaten van "the" of een alias telt als "gecorrigeerd".
- Er is geen phonetic matching, geen Levenshtein >1, geen server-side validatie en geen API-call voor antwoorden.

### 3.4 Familie-validatie

"Familie" heeft twee rollen:
1. **Antwoord-validatie**: `addCheckable(category,prompt,pool,test,family,thing)` (JS 843) filtert de vaste pool met `test` (letters bevatten/eindigen/vermijden, woordaantal, dubbele letter, lengte, letterpaar, first/last). Alleen strikt door de predicaten geldige antwoorden komen in de bank; de prompt is dus altijd objectief checkbaar. `thing` (bijv. `'a country'`) stuurt rarity-specialisatie.
2. **Vraag-diversiteit**: `familyOf()` (JS 889) gebruikt `item.family` of de genormaliseerde prompt om gelijksoortige vragen over vluchten heen te herkennen (zie §2.4).

---

## 4. Afstand, waypoints, animaties

### 4.1 Landmarks en distance-model

`landmarks` (JS 4-20): 16 entries `{at, name, distance, caption, fact}` met score-drempels `0,25,50,75,100,140,175,210,250,290,345,405,470,535,605,675` (Earth → Interstellar space). Elk bevat een "fact" die in toast/debrief wordt gebruikt.

- `current()` (JS 954): `[...landmarks].reverse().find(m=>score>=m.at) || landmarks[0]`.
- `kmOf(m)` (JS 955): parsed `'12 KM'`, `'~400 KM'`, `'384,400 KM'`, `'~225M KM'`, `'~1.4B KM'`; `FAR OUT` → `24_000_000_000` km (`2.4e10`).
- `distanceAt(points,low,high)` (JS 956): lineaire interpolatie `a+(b-a)*t`, **maar** geometrische interpolatie `a*Math.pow(b/a,t)` zodra `a>0 && b/a>20` (grote sprongen zoals 400 km → 384.400 km). Formatting: `<10 → 1 decimaal`, `<1000 → afgerond`, `<1e6 → "K"`, `<1e9 → "M"`, anders `"B"`; geen `high` → `{number:'FAR',unit:'OUT'}`.
- `view()` (JS 957): zet `#currentLocation`, `#distanceText`, `#hudScore`, `#nextStop`, `#railFill.height`, `#railHead.bottom` (alles `score/700*100%`). Scroll: `y = innerHeight*anchor - (3400 - score*4)` met `anchor = state==='intro' ? .40 : .31`; `#world` krijgt `translate3d(0,round(y)px,0)`. Waypoints staan op `top = 3400 - at*4` px (JS 953), krijgen `.passed` als `at<=score`, en worden onzichtbaar als `screenY < 116` (desktop) / `<185` (mobile, `innerWidth<=760`) of `> innerHeight-65`.
- `sceneInit()` (JS 953): deterministische LCG `seed=124858; seed=(seed*1664525+1013904223)>>>0` voor 340 sterren (`top` 0-3200 px; `.big` bij `rand>.89`, `.cross` bij `rand>.976`); bouwt de 15 waypoint-DOMnodes met `escapeHTML` (JS 925).
- Zichtbaarheid van decoraties: `view()` toggle `.visible` op `.scene-encounter,.earth-globe` op basis van `data-from`/`data-until` in HTML 142-152: globe 70-190, Laika 140-205, Ham 175-235, Yuri 210-275, UFO 415-505 / 505-575 / 575-635 / 635-700.
- Initiale `transition:none` op `#world`, `sceneInit()`, `show('intro')`, en na dubbele `requestAnimationFrame` de transition weer aanzetten (JS 993) — voorkomt een "aanvlieg"-animatie bij load. `resize` → `view()` (JS 992).

### 4.2 Animatie-effecten

- `ascend()` (JS 964): `view()`, `#speedLines.active`, `body.boosting`, 1850 ms timer om beide weer uit te zetten. CSS: `.world{transition:transform 2.6s ...}` (regel 16) / 1.85 s (regel 64), `.speed-lines` met `rush`-keyframes, `body.boosting .ship-zone{animation:surge...}`.
- `flashResult()` (JS 965-975): toast met `+punten`, label, titel (laatste gepasseerde landmark, of `'ASCENDING · <distance>'`, of `'NO POINTS'`), caption/fact; art-keuze in `lockAnswer` (JS 984-985): story-landmarks 140/175/210 krijgen prioriteit, art-mapping `{140:'laika',175:'ham',210:'yuri'}`, plus `'ufo'` bij eerste passage van score 420. Toast: 2500 ms zichtbaar + 280 ms fade-out; `void toast.offsetWidth` forceert reflow voor herstart van de CSS-transitie.
- `sendComet/sendSatellite/sendUfo` (JS 950-952): Web Animations API (`el.animate([...],{duration,easing})`), verwijderen bij `onfinish`. Comet 3500-5200 ms `linear`, satellite 8200 ms, UFO 4600 ms `ease-in-out` (van rechts naar links). Start: `setTimeout(sendComet,1200)`, `setTimeout(sendSatellite,1900)`, `setInterval(()=>{sendComet(); if(score>=420 && Math.random()<.35) sendUfo()},4200)`, `setInterval(sendSatellite,7800)` (JS 993).
- `canAnimate()` (JS 949): blokkeert alles bij `document.hidden` of `matchMedia('(prefers-reduced-motion: reduce)')`; CSS regel 34/72/96 zet daarnaast animaties/transitions uit en verbergt `.ambient-layer`.
- `end()` stuurt UFO ook direct bij passage score 420 via `if(old<420&&score>=420)sendUfo()` (JS 987).

---

## 5. localStorage: keys en structuur

Alle toegang zit in `try/catch` (failliet storage = stille no-op). Overzicht:

| Key | Type / voorbeeld | Lezen | Schrijven | Doel |
|---|---|---|---|---|
| `ascent-best` | int-string, `"0470"` | `end()` via `Number(localStorage.getItem('ascent-best')||0)` | `end()`: `Math.max(score, best)` | Beste score, getoond in `#bestScore` |
| `ascent-question-bag-v5` | JSON `{"bag":[12,873,…],"last":[4,91,…]}` — indices in `banks` | `chooseDeck()` (JS 894), alleen bij `!bagLoaded`, met int/range/Set-validatie | `chooseDeck()` (JS 922) na elke vlucht | Question bag + vorige 7 vragen (anti-herhaling) |
| `ascent-completed-flights-v1` (`AD_COUNTER_KEY`) | int-string | `readStoredCounter()` bij init | `recordCompletedFlight()` in `end()` | Teller afgeronde vluchten (ad-interval) |
| `ascent-last-flight-debrief-v2` (`DEBRIEF_LAST_SHOWN_KEY`) | int-string | `loadDebriefBaseline()` | `loadDebriefBaseline()` bij ontbreken (= huidige teller), `renderFlightDebrief()` | Baseline voor "elke 2 vluchten" debrief |
| `ascent-analytics-consent-v1` | `'granted'` \| `'denied'` \| afwezig | `readAnalyticsConsent()` | `storeAnalyticsConsent()` via `setAnalyticsConsent()` | GA-consent |

Counters: `readStoredCounter` accepteert alleen `Number.parseInt` die `Number.isSafeInteger` en `>=0` is, anders 0 (JS 926); `recordCompletedFlight` clamp op `Number.MAX_SAFE_INTEGER` (JS 942). `loadDebriefBaseline` schrijft bij eerste bezoek de huidige `completedFlights` weg zodat een oude teller niet meteen een debrief triggert (JS 928). Consent-lezer accepteert alleen exact `'granted'`/`'denied'` (JS 929). Versiebevanging in de keys (`-v5`, `-v2`, `-v1`) maakt migratie mogelijk door simpelweg een nieuwe key te gebruiken.

---

## 6. Analytics, consent en advertenties

### 6.1 Analytics (GA4, consent-first)

- `GA_MEASUREMENT_ID = 'G-G987KT8K4C'` (JS 882; HTML regel 13). `gtag()` bestaat al als dataLayer-stub.
- `startAnalytics()` (JS 931-938): guard `analyticsLoaded || consent!=='granted' || !/^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID)`; zet `gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})`, `gtag('js',new Date())`, `gtag('config',ID,{send_page_view:true})`, injecteert `<script id="ascent-ga4" async src="https://www.googletagmanager.com/gtag/js?id=...">`.
- `trackAnalytics(name,details)` (JS 939) doet niets tenzij `consent==='granted' && analyticsLoaded`. Gebruik:
  - `start()`: `game_start` met `{flight_question_count: deck.length}` (= 7);
  - `end()`: `game_complete` met `{flight_score, flight_destination: stage.name, questions_completed: history.length}`.
  - **Geen enkele track-call bevat de ruwe invoertekst of antwoorden** — consistent met de bannertekst (HTML 212: "Your answer text is never sent").
- `initAnalyticsConsent()` (JS 941): bij `granted` direct starten; bij `denied` niets; bij afwezigheid banner `#analyticsConsent` tonen. Knoppen (JS 991) `setAnalyticsConsent('granted'|'denied')` + banner verbergen. `setAnalyticsConsent` (JS 940) validatie + persist + `startAnalytics()` bij granted. Er is **geen** "intrekken"-knop nadat een keuze is opgeslagen (banner blijft verborgen).
- Consent Mode zet advertisement-storage expliciet op `denied`, ook al laadt de AdSense-SDK in de head (zie hieronder).

### 6.2 Advertenties

- `ADSENSE_CONFIG = Object.assign({client:'ca-pub-9868427903124193', slot:''}, window.ASCENT_ADS||{})` (JS 882). `slot` is leeg → `validAdSenseConfig()` (JS 944, `/^ca-pub-\d+$/` + `/^\d+$/`) faalt, dus er wordt geen `<ins>`. SDK zelf staat wel als `async` script in HTML regel 11 (site-verificatie, zie comment regel 9).
- `loadAdSense(client)` (JS 945): idempotent via `adScriptPromise` en `window.adsbygoogle`; injecteert `script#ascent-adsense-sdk` met `crossOrigin='anonymous'`; resolve/reject op load/error.
- `renderFlightDebriefAd()` (JS 946): bij geldige config een `<span>ADVERTISEMENT</span>` + `<ins class="adsbygoogle" data-ad-client data-ad-slot data-ad-format="auto" data-full-width-responsive="true">`, dan `(window.adsbygoogle=window.adsbygoogle||[]).push({})`; bij fout wordt de slot leeggemaakt en verborgen.
- `AD_INTERVAL=2` (JS 882): `debriefIsDue() = completedFlights - lastDebriefAt >= 2` (JS 943). `renderFlightDebrief(stage)` (JS 947) wordt vanuit `end()` aangeroepen, werkt `lastDebriefAt` bij, toont "TWO FLIGHTS LOGGED.", `#flightDebriefCount` (2-cijferig), waypoint + fact, en rendert de ad. Anders wordt de debrief verborgen en de ad-slot leeggemaakt.

---

## 7. Functie-inventaris (met JS-regel)

| Functie | Regels | Rol |
|---|---|---|
| `make` | 22-24 | Parset curated `name\|points\|aliases` → bank-object |
| `addNames` | 651-654 | Maakt bank met positie-gebaseerde punten (25→100) |
| `poolFromGroups`, `poolFromPrompt`, `uniqueNames` | 794-796 | Bouwen/de-dupliceren van antwoordpools |
| `cleanLetters`, `nameKey` | 817-818 | Accent/punctuatie-normalisatie voor rarity en families |
| `rarityOf`, `addCheckable` | 842, 843-854 | Zeldzaamheid + generatie controleerbare prompts |
| `norm`, `variants`, `editDistanceOne`, `findAnswer` | 884-887 | Antwoordnormalisatie, meervoud, 1-fout correctie, matching |
| `shuffle`, `familyOf`, `chooseDeck` | 888, 889, 890-924 | Fisher-Yates, familie-normalisatie, 7-vragen selectie + anti-herhaling |
| `escapeHTML` | 925 | XSS-bescherming voor dynamische waypoints/HUD |
| `readStoredCounter`, `storeCounter`, `loadDebriefBaseline` | 926-928 | Robuuste counter-storage + debrief-baseline |
| `readAnalyticsConsent`, `storeAnalyticsConsent`, `startAnalytics`, `trackAnalytics`, `setAnalyticsConsent`, `initAnalyticsConsent` | 929-941 | GA4-consent lifecycle + events |
| `recordCompletedFlight`, `debriefIsDue` | 942-943 | Vluchtenteller + 2-vluchten interval |
| `validAdSenseConfig`, `loadAdSense`, `renderFlightDebriefAd`, `renderFlightDebrief` | 944-947 | AdSense-validatie, lazy SDK, debrief-ad |
| `beginFlight` | 948 | `start()`-alias voor buttons |
| `canAnimate`, `sendComet`, `sendSatellite`, `sendUfo` | 949-952 | Reduced-motion gate + WAAPI ambient effecten |
| `sceneInit` | 953 | Deterministische sterrenhemel (LCG) + waypoint-DOM |
| `current`, `kmOf`, `distanceAt`, `view` | 954-957 | Landmark, km-parsing, interpolatie, HUD/world-transform |
| `show`, `stopTimer`, `tick`, `progress`, `playRound`, `start` | 958-963 | State-machine, 25 s timer, ronde-opbouw |
| `ascend`, `flashResult`, `lockAnswer`, `end` | 964-990 | Boost-effect, feedback-toast, antwoord-lock, afronding |

Event-handlers (JS 991-993): `startButton`, `answerForm submit`, `answerInput input` (herstelt hint/border), `replayButton`, analytics accept/reject, `shareButton` (`navigator.clipboard` met fallback-tekst), help-modal open/close/backdrop/Escape, `resize→view`, en de ambient timers.

---

## 8. Interessant om te hergebruiken in een eigen spel

**Sterke, herbruikbare patronen:**

1. **"Gegeneerd, maar offline checkbaar" vraagmodel** (`addCheckable`) — 1.133 extra vragen uit 16 curatielijsten + 10 predicaten, met `valid.length<6` en `existingPrompts` als kwaliteits-poort. Geen LLM, geen netwerk, geen moderator nodig. Ideaal voor een quiz met oneindig-ogende variatie.
2. **Question bag + family/category balancing** (`chooseDeck`): gegarandeerd 1 curated vraag, family-diversiteit over de vorige vlucht, categorie-score `freq/(1+2.3*used)`, persistente bag. Direct herbruikbaar voor elke vraag- of kaartengenerator.
3. **Rarity-scoring zonder externe data** (`rarity` map + `rarityOf` + `addNames` positie-formule + `familiarCountries`/`rareCountries`): maakt "hoe zeldzamer hoe meer punten" speelbaar en uitlegbaar; de fallback op naam-lengte voorkomt gaten in de lijst.
4. **Tolerant antwoordmatchen** (`norm` + `variants` + `editDistanceOne` met transpositie + unieke-match-eis): korte, veilige fuzzy matching; aliases en "the/a/an"-verwijdering; alleen een "gecorrigeerd"-label, geen stille herschrijving van de score.
5. **Retry-until-timeout** (JS 979): fout antwoord geeft hint + select, maar verbruikt de vraag niet → minder frustratie, geen extra state-machine.
6. **Afstandsinterpolatie** (`kmOf`/`distanceAt`): schakelt automatisch over op log-achtige schaal bij grote ratio's (`b/a>20`) en formatteert K/M/B — mooi voor een "reis"-HUD die zowel 12 km als 4,5 miljard km toont.
7. **Deterministische decoratie** (`sceneInit` LCG seed 124858): reproduceerbare sterrenhemel zonder assets of storage; `canAnimate()` + CSS reduced-motion als toegankelijkheidsstandaard.
8. **Consent-first analytics + versioned, defensieve localStorage** (`readAnalyticsConsent`, `readStoredCounter`, try/catch overal, keys met `-vN`): nette manier om tracking uit te stellen tot consent en oude/corrupt storage te overleven.
9. **Toast + boost choreografie** (`flashResult`/`ascend`): reflow-truc (`void toast.offsetWidth`), extendable CSS-klassen, art-mapping op milepunt — weinig code, veel feedback.

**Val aandachtspunten / niet klakkeloos kopiëren:**

- Hardcoded advertentie-/tracking-IDs (`ca-pub-9868427903124193`, `G-G987KT8K4C`) en de **onvoorwaardelijke** AdSense-SDK-load in `<head>`; als je consent-first wilt zijn, laad ook die SDK pas na consent.
- `unrecognized`, `advanceTimer` en de CSS `state-result` zijn dode resten; `corrected` is alleen cosmetisch.
- Ranks (>=610) en kopteksten (>=605/290) gebruiken verschillende drempels — afstemmen.
- `familyOf`'s regex is prompt-tekst-afhankelijk; bij het wijzigen van prompts moet die mee.
- Anti-herhaling dekt alleen de laatste 7 vragen (`lastPlayed`); bij een kleine pool of veel vluchten komen vragen terug.
- Alle spel- en scoringslogica staat client-side in één IIFE zonder modularisatie; voor hergebruik is opsplitsen in modules (banks, matcher, deck, view, storage) aan te raden. De pure functies `norm/variants/editDistanceOne/findAnswer`, `rarityOf` en `distanceAt` zijn het makkelijkst te extraheren.
- De 1-fout-typo fallback vereist unieke match (`findAnswer`); met een kleine pool of veel aliases kun je onbedoeld "bijna" antwoorden accepteren — houd de `>=5` lengte-guard en uniekheids-eis.

---

### Bewijs-index (sleutelconstanten)

`const landmarks` (JS 4), `const banks` (25), `featuredCount=banks.length` (791), `corpora` (797), `existingPrompts` (815), `rarity/knownAliases` (820), `familiarCountries/rareCountries` (829-830), `extraAliases` (832), `AD_INTERVAL=2, AD_COUNTER_KEY='ascent-completed-flights-v1', DEBRIEF_LAST_SHOWN_KEY='ascent-last-flight-debrief-v2', ADSENSE_CONFIG, ANALYTICS_CONSENT_KEY='ascent-analytics-consent-v1', GA_MEASUREMENT_ID` (882), `deadline=performance.now()+25000` (962), `score=Math.min(700,...)` (981), `localStorage 'ascent-question-bag-v5'` (894/922), `'ascent-best'` (990), `game_start`/`game_complete` (963/990).
