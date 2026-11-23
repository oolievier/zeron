# Krillion.io — technische & UX-analyse (statisch)

**Datum:** 2026-11-23  
**Methode:** statische analyse van `/tmp/opencode/krillion.html` + `curl` van alle `<script>`/`<link>`-assets en van de routes `/faq`, `/packs`, `/party`, `/account`, `/friends`, `/unlimited/classic`, `/archive`. Geen browser, geen uitvoering van JS. Alle assets zijn lokaal opgeslagen in `/tmp/opencode/krillion-assets/`.

> **Korte samenvatting:** Krillion is een solo «daily dive»-woordspel met 7 prompts per dag, 25 seconden per antwoord en zes zeldzaamheids-tiers (10→100 punten, 10 m per punt). De kern is niet «gelijk of fout», maar «hoe zeldzaam is je antwoord volgens de verzamelde answer set». Rond die kern zit een sterke retentielaag: streaks/mascottes, archief, betaalde themawerelden, een vrienden-leaderboard met deelbare antwoorden en een apart realtime «hot potato»-partyspel. Visueel is het een donker oceaan-/CRT-pixelspel met VT323, neon-cyaan/pink/goud, canvas-dalingsanimatie en per pack een eigen wereld. Voor een cyberpunk-variant is vooral de **tier-als-rarity-engine + beweegbare HUD + share-emoji-rij** het waardevolle patroon; de thema-laag is volledig verwisselbaar.

---

## 1. Technische opbouw

| Kenmerk | Bevinding | Bewijs |
|---|---|---|
| Framework | Next.js App Router met React Server Components/Flight-payload + Turbopack-chunks | `[H]` HTML bevat `self.__next_f.push([1,"..."])`, `data-dpl-id="dpl_..."`, chunknamen als `turbopack-15ml26dbdhvdy.js`, `I[99214,[...]]` |
| Rendering | Server levert shell + menu; spel UI wordt client-side gehydrateerd | `[H]` `<div class="ds-boot">…descending…</div>` + `<!--$-->`-suspense markers |
| Font | Zelf gehoste `VT323` WOFF2, met fallback naar monospace | `[H]` `<link rel="preload" … .woff2>`; `[CSS]` `--font-display:"VT323", "VT323 Fallback"` |
| Theme token | Donkere modus hardcoded | `[H]` `<meta name="theme-color" content="#050a14">` |
| Analytics/ads | Google Analytics (`G-T5E40G4DTP`), AdSense-slots, eigen `track()`-events | `[H]` gtag-preload; `[JS-RESULTS]` `track("game_start"|"game_complete"|"share_copied"…)`; `[JS-PARTY]` `.kr-ad-placement` |
| Auth/sync | Google/Firebase ID-token voor account, streaks en vrienden | `[JS-ACCOUNT]` `Continue with Google`; `[JS-FRIENDS]` `firebaseAuth()`, `getIdToken()`, `Authorization: Bearer …` |
| Betalingen | Stripe-links per unlock ($5) | `[JS-STATE]` `https://buy.stripe.com/…`, `priceLabel:"$5"` |
| Anti-bot (party) | Cloudflare Turnstile | `[JS-PARTY]` `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` |
| Storage | `localStorage`/`sessionStorage` met `krillion:*`-keys; account sync via API | `[JS-STATE]`, `[H]` inline scripts |

**API-oppervlak (statisch gevonden):**

```
/api/today, /api/today?preview=…, /api/submit, /api/today/complete,
/api/feedback, /api/suggest, /api/reveal?date=…, /api/answer-popularity?date=…
/api/unlimited, /api/unlock, /api/restore, /api/account/progress, /api/account/purchases
/api/packs/{movies|sports|geography|lexicon}, /api/packs/{id}/unlock
/api/friends, /api/party/token, /api/party/rooms, /api/party/activity,
/api/party/{code}, /api/party/admin…, /api/announcements/current
```

Twee opvallende **privacy/UX-details in de HTML-self** (vóór hydratatie):

```html
<!-- [H] regel 63 — invite-token wordt uit de hash gehaald en direct uit de URL gewist -->
if(location.pathname!=="/friends")return;
var t=new URLSearchParams(location.hash.slice(1)).get("invite");
sessionStorage.setItem("krillion:pending-friend-invite",/^[a-f0-9]{64}$/.test(t)?t:"invalid");
history.replaceState(null,"",location.pathname+location.search)
```

```html
<!-- [H] regel 64 — contrastvoorkeur vóór first paint -->
if(localStorage.getItem("krillion-contrast")==="1")document.documentElement.classList.add("colorblind")
```

---

## 2. Spelconcept

Officiële positionering (meta tags, `[H]`):

> “Seven prompts a day, same for everyone. Rare answers sink you deeper. Obvious ones barely count. One in a krillion.”

De in-game «how to play» ([JS-RESULTS]) is nog explicieter:

```js
"7 prompts a day. same for everyone."
"25 seconds to name one thing."
"rare answers score big. obvious ones float."
"the pick that feels clever? the school thought of it too."
"every point sinks you 10 metres. 700 is the trench."
"one dive per day. no second chances."
```

**Kernloop:** elke dag 7 identieke vragen voor iedereen → per vraag 1 vrij antwoord → server matcht tegen een kurated answer set met aliases → antwoord krijgt een **tier** i.p.v. binair goed/fout → punten sommeren tot een duikdiepte → delen als tekst/emoji-rij.

De maker legt de curation uit in `[FAQ]`: answer sets komen uit dictionaries/wiki/encyclopedieën, zeldzaamheid wordt deels mechanisch berekend (`familiarity database`) en deels met LLM-assistentie + handmatige pass. De «Krillion» (goud) is bewust **niet alleen** de zeldzaamste: voorbij een bepaalde diepte is zeldzaamheid moeilijk te onderscheiden, dus telt *fun factor* — «the gem should be something at least a few of you actually get».

---

## 3. Menu & modi

Het menu is een toegankelijke `<dialog>` met `aria-haspopup="dialog"`, `aria-controls="site-menu"`, `aria-expanded`, pixel-SVG-iconen (`shape-rendering="crispEdges"`, `[H]` regels 73–175):

| Modus | Route | Beschrijving |
|---|---|---|
| **Daily dive** | `/` | Hoofdspel; 1× per dag, middernacht ET-reset, streak-telling. |
| **Unlimited** | `/unlimited/classic` | «THE ENDLESS DIVE», ∞-badge, herhaalbare duiken; unlock $5. Zelfde engine/theme als daily, andere UI-copy (`∞ Dive #n complete`). `[JS-STATE]` |
| **Puffer Party** | `/party` | Realtime multiplayer category game (hot potato), aparte engine. Zie §7. `[PARTY]` |
| **Archive** | `/archive` | «Every aired daily, resurfaceable.» Replays van oude dagen; **tellen niet voor streak** (`[ACCOUNT]`). `[JS-STATE]` `kind:"archive"`, `game < today`. |
| **Themed packs** | `/packs` | 4 themawerelden + 1 gratis beta-pack: Movies, Sports, Geography, Words & Language (lexicon). 30 levels per pack, 7 antwoorden per level. `[PACKS]`, `[JS-STATE]` |
| **My Krillion** | `/account` | Logboek: streak, best score, completed dives, unlocks, dive buddies, Google-sync/restore. `[ACCOUNT]` |
| **Friends** | `/friends` | Uitnodigingen, vriendenlijst, dagelijkse leaderboard, antwoorden delen. `[FRIENDS]` |
| **Settings / FAQ** | — / `/faq` | Contrast, geluid, low-power, karakter; FAQ bevat o.a. de eerder genoemde ontwerp-uitleg. |
| **Merch / Chainle** | externe links | Merch-store met UTM-tags; «Try Chainle» van «my little brother» — slimme cross-promotie. `[H]` regels 149–172 |

**Thema’s per modus** (`[JS-STATE]`, `CLIENT_PACKS`) zijn niet alleen skins maarcomplete engine-varianten:

- **ocean** → `bg-top/mid/trench.webp`, 14.020 px floor, «rarer answers sink deeper», eenheid `m`.
- **boulevard/hollywood** → `world:"boulevard"`, neon-bg’s, «rarer answers drive farther», eenheid `blocks`, `THAT'S A WRAP`, `DIDN'T MAKE THE CUT`.
- **gauntlet/sports** → opeenvolgende vloeren: hardwood → clay → ice → pitch → gridiron → pool → track; `THE DEEP BENCH`.
- **globe/geography** → continent-zones (savanna, amazon, alps, greatwall, outback, canyon, antarctica); «around the world in seven answers».
- **notebook/lexicon** → bureau + notitieboek + krill-schrijver; «rarer answers write more words», `THE INK IS DRY`.

Elke variant herbruikt dezelfde 7-ronde logica en hetzelfde tiersysteem, maar vervangt `copy`, `theme`, `apiBase`, `payUrl` en `replayNote`. Dat is de belangrijkste architecturale les: **één scoring-engine, veel narratieve shells**.

---

## 4. Vraag/antwoordmechaniek

### 4.1 Fasen (client state machine)

Uit `[JS-DIVE]` (`3ipjrnh99b057.js`):

```
intro → preview (3 s) → answering (25 s) → feedback → [DESCEND ▼ / SURFACE ▲] → … ×7 → done
```

Relevante code:

```js
// [JS-RULES] timing constants
e.s(["ANSWER_MS",0,25e3,"PREVIEW_MS",0,3e3],98890);
e.s(["MAX_ANSWER_LENGTH",0,256]) /* module 98890 */

// [JS-DIVE] phase transitions
phase:"preview", previewEndsAt:Date.now()+p.PREVIEW_MS
phase:"answering", answerEndsAt:previewEndsAt+p.ANSWER_MS
phase:"feedback"  // na timeout of na geaccepteerd antwoord
```

Tijdens `preview` toont de UI: `descending · the clock starts in <n>`. Tijdens `answering` loopt een fuse-balk (`scaleX(remaining/ANSWER_MS)`) en bij <3,05 s krijgt het formulier `.hot`. timeout met leeg veld → `the clock beat you to it.`; timeout met getypt maar niet verzonden antwoord → «never made it onto the reef.».

### 4.2 Submission & autocorrect

```js
// [JS-DIVE] POST /api/submit
fetch("/api/submit",{ method:"POST",
  body:JSON.stringify({date:e.date, promptId:el.id, answer:t,
    previewCorrection:!n&&shouldPreviewAnswerCorrections(),
    playerId:Z.current, runId:r.runId})})
...
if(i.correction){ _(i.correction); L({from:t,to:i.correction}); return }   // live correctie
if(i.accepted && i.tier) ed({promptId, promptText, rawAnswer:t,
    answer:i.answer??t, tier:i.tier, score:i.score??TIERS[i.tier].score,
    quip:i.quip, receipt:i.receipt});
else … F(`"${t}": no echo. try again`) …                                 // retry vóór deadline
```

- **Autocorrect is bewust genereus**: `[FAQ]` legt uit dat duizenden antwoorden en aliases worden gecheckt; `sea donkey` vs `sea monkey` voor Threebanded Sheephead is hun voorbeeld van een verrassende match.
- **Fat-finger recovery**: een `correction` wordt eerst aan de speler getoond («wordt dit bedoeld?») vóór commit; instelling `krillion-answer-corrections`.
- **Receipts** (`i.receipt`) worden in results bewaard maar verwijderd bij het opslaan van history (`[JS-STATE]` `delete t.receipt`) — anti-tampering zonder client-side gevoelige data te laten circuleren.
- **服务端 authority**: score/tier komen van de server; client gebruikt alleen `TIERS[tier].score` als fallback.
- Na afloop: `POST /api/today/complete` met `{date, playerId, score, runId, results}`, alleen bij `record: !imported && score===serverScore` (`[JS-RESULTS]`).

### 4.3 Answer sheet / feedback

Na de dive is er een doorzoekbare, filterbare en sorteerbare «answer sheet» (`[JS-RESULTS]`):

- filter op tier, zoek op antwoord;
- sorteer op alphabetisch, **familiarity** (Linguabase high→low), **Goodreads count**, **IMDb votes**, **October player count**, en «Most chosen» (`/api/answer-popularity`);
- per antwoord: gekozen antwoord gemarkeerd, tier-kleur, quip, en `n players`;
- `/api/reveal?date=…` voor de volledige set; `/api/suggest` voor vragen («got an idea for a question? tell us what to ask») met throttling: `that's plenty for today — resurface tomorrow.`

Dit is meer dan een score-scherm: het is **de eerste keer dat de speler de verzameling ziet**, wat de «why was my answer not listed?»- FAQ direct beantwoordt (`Because I didn’t find it, sorry.`).

---

## 5. Scoring & tier-idee

### 5.1 Tiers (exact uit `[JS-CORE]`)

```js
let t={
 plankton :{name:"Plankton",        score:10,  emoji:"🫧", depth:.08,
            blurb:"The answer everyone blurts out."},
 tooclever:{name:"Too Clever",      score:15,  emoji:"🤡", depth:.18,
            blurb:"A famously “obscure” pick. Everyone reaches for it."},
 schooler :{name:"Schooler",        score:30,  emoji:"🐟", depth:.36,
            blurb:"Solid — swims with the school."},
 rare     :{name:"Rare",            score:60,  emoji:"🦑", depth:.60,
            blurb:"Genuinely uncommon. Nice pull."},
 deepcut  :{name:"Deep Cut",        score:85,  emoji:"🏮", depth:.82,
            blurb:"True obscurity. Few go this deep."},
 krillion :{name:"One in a Krillion",score:100, emoji:"🌟", depth:.97,
            blurb:"The designated gem. Trench floor."}
};
e.s(["MAX_DAY_SCORE",0,700,"MISS_EMOJI",0,"⬛","ROUNDS_PER_DAY",0,7, …])
```

**Totaal per dag:** max 7 × 100 = 700 → `every point sinks you 10 metres`.

### 5.2 Score bands (eindverdict)

```js
[{min:0,  tier:"plankton", range:"0–150",   verdict:"Plankton. Plenty of ocean left down there."},
 {min:151,tier:"schooler", range:"151–250", verdict:"Schooler. Swimming with the school."},
 {min:251,tier:"rare",     range:"251–350", verdict:"Rare. Below the thermocline. Nice."},
 {min:351,tier:"deepcut",  range:"351–449", verdict:"Deep cut. Seriously deep dive."},
 {min:450,tier:"krillion", range:"450+",    verdict:"One in a krillion. Trench dweller. Absurd."}]
```

Let op: `tooclever` is een **antwoord-tier** maar geen **eindband** — een subtiele, gunstige asymmetrie: de grap-tier bestaat per ronde, maar je eindigt nooit als «Too Clever».

### 5.3 Sociale calibratie

- `/api/today/complete` retourneert `betterThan` + `dist` (verdeling). UI: `better than <percentile>% of today's players` en een afgeronde SVG-graphic met `[0.06, 0.24, 0.4, 0.24, 0.06]`-kernel-smoothing (`[JS-CHART]` in `3me4f2hpci-y4.js`).
- `formatPercentile`: `e>=99.5 ? toFixed(2) : String(e)` — tiny detail die 99,5+ herkenbaar maakt.
- Score is dus **relatief aan de dag** én absoluut (punten/meters). Dat geeft zowel «hoe goed ben ik vandaag» als «hoe zeldzaam was ik echt».

### 5.4 Share-formaat

```js
// [JS-CHART]
buildShareText(day, score, tiers) =>
  `Krillion #${day} 🦐\n${score}\n\n${tiers.map(t=>t==="miss"?"⬛":TIERS[t].emoji).join("")}`
buildArchiveShareText => `Krillion ⟲ #${day} 🦐 ${score}  ${emojiRij}`
buildUnlimitedShareText(prefix) => `Krillion ∞ #…`
withShareLink(text) => `${text}\n\nhttps://krillion.io${suffix}`
```

De emoji-rij is een **perfect compression-formaat**: 7 glyphs tonen de hele run, zijn herkenbaar in een chat en zijn monotone-render-vriendelijk. Kopieer/native-share-events worden getrackt.

---

## 6. Sociale features

### 6.1 Friends

Uit `[JS-FRIENDS]` (`10-bgg_lga954.js`):

- Vereist Google-account + Firebase ID-token; `POST/GET /api/friends` met `Authorization: Bearer`.
- Invite-link: `https://krillion.io/friends#invite=<64-hex>`; token in **hash** (niet in query) en direct uit URL gewist door de inline script in `[H]`.
- Acties: `inspect`, `add`, `remove`, `block`, `profile` (username 3–20 tekens, `^[A-Za-z][A-Za-z0-9_]{2,19}$`, **1× per 30 dagen**), `rotate` (oude link ongeldig), `share-answers`.
- Leaderboard: `leaderboard.filter(e=>!e.self)`, toont `#rank`, `@username`, score en per ronde prompt/antwoord/tier.
- Privacy-toggle: `Your answers are now shared with friends.` / `Your answers are now private. Friends can still see your score.` → **score is publiek binnen de groep, antwoorden optioneel**.
- Polling: elke 30 s + bij `visibilitychange`/`online`, met `e.lastSync` als dependency.

### 6.2 Streaks & dive buddies

`[ACCOUNT]` toont: current/best streak, dives, best score, en mascottes:

| Streak | Buddy |
|---|---|
| 0 | The Krill |
| 5 | Schooler |
| 14 | Rare Squid |
| 30 | Deep Cut Angler |
| 45 | Evil Krill |
| 60 | Hackmanite |
| 75 | Fossil Krill |
| 100 | Mantis Shrimp |
| 150 | Leviathan |

Streaks lopen van middernacht **ET**, en archive-replays tellen niet mee. De mascotte is ook een officeel «dive buddy»-icoon (`aria-label="Dive buddy"`, `[JS-CHART]`) met locked/unlocked wardrobe en gouden variants — een sterke, goedkope progressie-laag bovenop de score.

### 6.3 Puffer Party (aparte sociale kernel)

`[PARTY]` + `[JS-PARTY]` + `[JS-PARTYUI]`:

> «pass the puffer · don’t let it pop on you» · «Name an answer and pass the puffer before it pops. Play with friends or join a public room. Last one floating wins.»

Regels in de «HOW TO PLAY»-dialog:

1. Answer before the puffer explodes on you.
2. **Rarer answers get you closer to an extra heart.**
3. No reusing answers for the current question.

Exacte constanten:

```js
DEFAULT_SETTINGS = { lives:2, maxLives:5, meterTarget:600,
  minTurnMs:8e3, fuseMinMs:1e4, fuseMaxMs:3e4,
  maxPlayers:6, isPrivate:false }
MAX_LIVES:10, MAX_METER_TARGET:5e3, METER_FULL:600,
METER_BY_TIER = {plankton:10, tooclever:15, schooler:30, rare:60, deepcut:85, krillion:100}
QUICK_PLAY_TABLES = { duel:{2–2,0ms}, trio:{3–3,0ms},
  party:{4–6, gather 15s}, crowd:{8–10, gather 20s} }
ROOM_CODE_LENGTH:4, ROOM_CODE_ALPHABET:"ABCDEFGHJKLMNPQRSTUVWXYZ"
POP_FREEZE_MS:1500, CATEGORY_SWAP_MS:1300, COUNTDOWN_MS:3000,
PRESENCE_PING_MS:15e3, ROOM_IDLE_TIMEOUT_MS:18e5,
MAX_CHAT_LENGTH:160, MAX_NAME_LENGTH:16, SEEN_CATEGORIES_MAX:300
```

`[FAQ]` vult de ergonomie in: de lont is **10–30 s willekeurig**, gedeeld over de kamer en loopt door bij doorgeven; bij <8 s wordt hij teruggezet naar 8 s (hot-potato/geïnspireerd op BombParty). Server-lag kan volgens de maker lijken alsof het nog jouw beurt is. Er is Turnstile-verificatie, een `guest-token`, reconnect-backoff (250 ms → max 24 s), pending-ratings in `sessionStorage` en een admin-API om games te pauzeren.

**UX-les:** de zeldzaamheids-score krijgt hier een tweede leven als *mechanische* beloning (meter → extra hart), niet alleen als highscore. Eén concept, twee spelvormen.

---

## 7. Visuele stijl & design

### 7.1 Tokens

```css
/* [CSS] 1nc1cayvsz2op.css */
:root{
 --color-abyss:#050a14; --color-shallow:#101d33; --color-line:#1b2c47;
 --color-foam:#e8f1ff; --color-drift:#7d93b8;
 --color-lumen-pink:#ff5d8f; --color-lumen-cyan:#4de3ff;
 --tier-plankton:#8fa3c4; --tier-tooclever:#ff9f43; --tier-schooler:#4de3ff;
 --tier-rare:#ff5252; --tier-deepcut:#9d7bff; --tier-krillion:#ffd166;
 --tier-miss:#3d4f6e; --tier-miss-lit:#5d739c; --hairline:#7d93b838;
}
/* [CSS] 34_c12hy9af8q.css */
--font-display:"VT323","VT323 Fallback";
```

VT323 wordt ook als **UI-monospace** gebruikt (`--font-mono-ui`), dus alle labels, scores en knoppen delen één terminal-lettertype. Kleine `fathom`-labels zijn lowercase, tracked en verticaal geritmeerd — een eigen «design language»-laag boven Tailwind-achtige utilities.

### 7.2 Canvas & motion

`[JS-CORE]` (`3itjc0tls3d-u.js`) bevat `createDescentEngine()`: een canvas-scène met:

- `ds-stage`, `ds-surface`, `ds-vignette`, `ds-floor` op `top:14020px`, 7 tier-lijnen (`for(let e=0;e<7;e++)`);
- continues dalen via `requestAnimationFrame`, particles/bubbles, `descendToRound(...,2400)` en `plunge()` met `outcomeToPlunge(result, cumulativeScore)`;
- score-slam, glints, reject-jolt, `data-low-power`, `data-reduced-motion`, `prefers-reduced-motion`-vriendelijke paden;
- geluid via WebAudio-achtige `playSfx("begin"|"descend"|"submit"|"submit_soft")` en `krillion-muted`.

CSS versterkt dat met `@keyframes ds-crt-zap`, `ds-title-flicker`, `ds-edge-throb`, `ds-score-slam`, `image-rendering:pixelated`, `filter:url(#coral-sway-filter)`, glow-`text-shadow`s in cyaan/pink/goud en een `radial-gradient`-vignette. Pixel-art sprites: `/tiers/{krillion,schooler,rare,deepcut,krillion-gold}.png`, `/gen/party/puffer-{n}.png`.

### 7.3 Toegankelijkheid & performance

- Echte `<dialog>` + `aria-*` op menu, how-to-play en party-regels; `role="status"`, `aria-live="polite"` voor correcties en foutmeldingen.
- Toetsenbord: Enter → DESCEND, maar expliciet genegeerd bij huidige `preview`, in inputs, of bij open dialog (`[JS-DIVE]`).
- Contrast-mode vóór first paint; low-power/muted switches; `shape-rendering="crispEdges"` voor icons.
- Preload van font + twee cruciale sprites; `fetchPriority="low"` op de RSC-chunk; `noModule`-fallback chunk.

---

## 8. Designlessen voor een eigen cyberpunk-variant

1. **Neem de rarity-engine, niet het oceaan-thema.** Vervang `TIERS` door neon-codename tiers (bijv. `STATIC 10 / GLITCH 15 / RUNNER 30 / GHOST 60 / ZERO-DAY 85 / SINGULARITY 100`) met dezelfde `score/depth/color/blurb/emoji`-vorm. De `depth` is direct bruikbaar als «layer in de grid».
2. **Houd de 7-ronde/25 s/3 s-cadans.** Dat is de pacing: 3 s *teaser* + 25 s druk + Feedback → DESCEND-knop geeft elke ronde een mini-cliffhanger. Voor cyberpunk: `JACKING IN · trace starts in 3`, `TRACE 25 s`, `PACKET ACCEPTED`, `GO DEEPER ▼`.
3. **Maak de HUD de protagonist.** Krillion laat de duik zelf bewegen (canvas, 14 k px, tier-lijnen, plunges). Cyberpunk-equivalent: scrollende datastroom/spiderweb, tier-«firewalls» die je passeert, glitch-burst bij reject, neon-scanlines. Behoud `reduced-motion` en `low-power`.
4. **Score = 3 lagen.** Puntensom + eindband + `betterThan`-percentiel met verdelingsgrafiek. Dat voelt rechtvaardig én competitief zonder leaderboard-hype. Toon de 15/85/… emoji-rij in share-teksten.
5. **Bouw een «Too Clever»-val.** De grap-tier («everyone reaches for it») voorkomt dat spelers artificeel obscuur gaan doen; cruciaal voor een niche-/internet publiek. Documenteer ook openbaar *waarom* de gem niet puur op zeldzaamheid is (zie FAQ) — dat schept vertrouwen.
6. **Herbruik de shell-strategie.** Eén `CLIENT_PACKS`-achtige config (`id`, `theme`, `copy`, `apiBase`, `payUrl`, `introLinks`, `replayNote`) en meerdere werelden (ocean/boulevard/gauntlet/globe/notebook) = jouw versie: `NEON CITY / NETRUNNER / CORPO / BLACK MARKET / MAINFRAME`. Elke wereld krijgt eigen achtergrondlagen, SFX en werkwoorden (`sink`→`breach`, `m`→`nodes`).
7. **Sociaal met privacy-schakelaar.** De Krillion-aanpak is sterk: vrienden zien je score, antwoorden alleen als je het aan zet. Invite-token in de **hash**, validatie vóór hydration, token uit URL wissen. Neem dat patroon letterlijk over.
8. **Geef zeldzaamheid een tweede mechaniek.** In Puffer Party vult de meter met tier-punten en geeft hij een extra hart. In cyberpunk: zeldzaam antwoord = meer «buffer» tegen trace, of extra credits om een firewall te skippen.
9. **Toon de answer sheet.** Een doorzoekbare set met frequentie/familiarity bronnen maakt het spel leerzaam en vermindert supportvragen. Voor cyberpunk: «known aliases in the grid», bron-label per antwoord.
10. **Monetisatie zonder te schreeuwen.** Eén unlock $5 zet ads *sitewide* uit; de gratis pack (lexicon) werkt als demo. Overweeg cosmetische «dive buddy»-skins via streaks in plaats van lootboxes.
11. **Kleine details die veel waard zijn:** `formatPercentile(99.53)` → `99.53`; invite-validatie `/^[a-f0-9]{64}$/`; roomcode-alphabet zonder `I/O`; 8 s-vloer op de lont; 30-daagse username-cooldown; replay telt niet voor streak. Dit zijn anti-frustratiebeslissingen, geen feature-creep.

---

## 9. Beperkingen van deze analyse

- Alles is statisch: server-side scoring, rarity-dataset en daadwerkelijke prompt-inhouden zijn **niet** zichtbaar; alleen `/api/*`-contracten en client-effecten.
- Chunks zijn geminificeerd; fragmenten zijn letterlijk gekopieerd maar variabelen zijn intern (`t`, `e`, `r`). Module-ID’s (bijv. `86062`, `98890`) zijn Turbopack-intern.
- Gameplay is alleen afgeleid uit state-transities, UI-copy en de FAQ; er is geen runtime-observatie van API-responses.
- `dpl=…-` queryparameters zijn deployment-specifiek en kunnen veranderen; basis-URL’s blijven geldig.

---

## 10. Bronnen

| Ref | URL |
|---|---|
| `[H]` | https://krillion.io/ (lokale kopie: `/tmp/opencode/krillion.html`) |
| `[FAQ]` | https://krillion.io/faq |
| `[PACKS]` | https://krillion.io/packs |
| `[PARTY]` | https://krillion.io/party |
| `[ACCOUNT]` | https://krillion.io/account |
| `[FRIENDS]` | https://krillion.io/friends |
| `[JS-CORE]` | https://krillion.io/_next/static/chunks/3itjc0tls3d-u.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-RULES]` | https://krillion.io/_next/static/chunks/3me4f2hpci-y4.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-DIVE]` | https://krillion.io/_next/static/chunks/3ipjrnh99b057.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-STATE]` | https://krillion.io/_next/static/chunks/3j028aa--jhrw.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-RESULTS]` | https://krillion.io/_next/static/chunks/1c60lcmp9l51i.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-CHART]` | https://krillion.io/_next/static/chunks/3me4f2hpci-y4.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-PARTY]` | https://krillion.io/_next/static/chunks/0r2pf9ih29dld.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-PARTYUI]` | https://krillion.io/_next/static/chunks/0ebdng4vfm6wj.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-FRIENDS]` | https://krillion.io/_next/static/chunks/10-bgg_lga954.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[JS-ACCOUNT]` | https://krillion.io/_next/static/chunks/0e4mrb6beadqk.js?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
| `[CSS]` | https://krillion.io/_next/static/chunks/1nc1cayvsz2op.css?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR · https://krillion.io/_next/static/chunks/34_c12hy9af8q.css?dpl=dpl_57EFjsWumV8N2ErENWJD4hZLdnBR |
