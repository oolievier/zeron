# ZERON scoring-model

De engine staat in [`src/lib/scoring.js`](../src/lib/scoring.js) en wordt zowel in de browser (solo) als in de kamer-API (server-side) gebruikt. Er is geen AI, geen netwerkcorpus en geen live spelersdata: alles is reproduceerbaar.

## 1. Normaliseren

`normalize()`:

1. trimmen + lowercase;
2. NFKD, diacritica verwijderen (`Café` → `cafe`);
3. `ø/æ/œ/ß` → `o/ae/oe/ss`;
4. apostroffen en hyphens worden spaties;
5. alles behalve `a-z0-9`, spatie en `'` verwijderen;
6. whitespace samenvoegen.

## 2. Expliciete vraagregel

Iedere vraag heeft een `rule`-object (`answerRule(question)` geeft altijd een regel terug):

```js
{ kind: 'listed', hint: 'Een herkenbaar antwoord voor dit signaal telt; hoe zeldzamer, hoe meer punten.', categoryHint: '…' }
```

De hint wordt in de UI bij de vraag getoond. Een vraag mag extra velden hebben (`startsWith`, `minWords`, `contains`); die worden ná de herkenning op het gevonden antwoord gecontroleerd. Faalt zo'n regel, dan is het antwoord fout — ook al is het woord herkend.

## 3. Herkenning en typo-correctie

De engine matcht niet alleen exacte tekst. Elk antwoord in het register wordt uitgebreid met schrijfvormen: zonder lidwoord, enkelvoud/meervoud, eenvoudige Nederlandse stamvormen en woordvolgorde-varianten. Daardoor tellen `een wekker`, `wekker`, `wekkers` en `de wekkers` als hetzelfde antwoord.

`correctTypo()` blijft beschikbaar voor losse woorden van 4+ tekens en corrigeert alleen bij exact één kandidaat op bewerkingafstand 1. Daarnaast vergelijkt de matcher de invoer rechtstreeks met alle antwoordvormen; één typfout op een herkenbaar antwoord wordt hersteld met −3 punten. Meerdere kandidaten of geen kandidaat = geen gok.

De UI toont de herkende vorm alleen als de invoer daadwerkelijk is aangepast.

## 4. Validatie en fout antwoorden

Afgewezen worden: lege antwoorden, >60 tekens, geen alfanumeriek teken, `aaaaaaaaaa`-achtige herhalingen, links/domeinen.

**Een antwoord dat niet door het gewogen register van de vraag wordt herkend, is fout.** Er is geen pseudo-rarity meer. Elk fout antwoord geeft:

```js
{
  ok: false, wrong: true, points: 0,
  reason: 'NOT_IN_LIST' | 'RULE_FAILED' | <validatiefout>,
  label: { key: 'wrong', label: 'Fout', color: '#ff425d' },
  notes: ['ANTWOORD NIET IN LIJST', …]
}
```

In solo wordt een **definitief** fout antwoord genoteerd met **0 punten** en een rood `Fout`/`WRONG`-scherm; de speler ziet de regel en de reden. In kamers gebruikt de server dezelfde uitkomst: de reveal toont `Fout`, 0 punten en geen bonus. Timeouts en lege antwoorden krijgen hetzelfde rode label.

### 4b. Antwoordlijsten en retries

Iedere basisvraag heeft een groot, vraagspecifiek register in [`src/data/recognition/`](../src/data/recognition/): **91–120 antwoorden per vraag** (gemiddeld 104; totaal 23.255), verdeeld over `common`, `uncommon`, `rare` en `ghost`. De handgeschreven basis en [`src/data/expansions/`](../src/data/expansions/) worden daarin opgenomen; [`src/data/answer-banks.js`](../src/data/answer-banks.js) voegt alles samen en geeft elk antwoord een eigen gewicht. NV/EN-vragen accepteren ook antwoorden in de andere taal. Communityvragen zonder eigen register gebruiken de sector/tag-bank als terugval. Elk registerantwoord wordt door de engine geaccepteerd (getest in `tests/scoring.test.js`).

Daarnaast bevat [`tests/coverage-samples.js`](../tests/coverage-samples.js) een onafhankelijke steekproef van 896 plausibele antwoorden die **niet letterlijk** in een register staan. [`tests/coverage.test.js`](../tests/coverage.test.js) controleert dat minimaal 90% daarvan wordt herkend; de huidige stand is **896/896 = 100%**, gelijk verdeeld over alle acht sectoren.

Een antwoord dat niet wordt herkend, is fout — maar **beëindigt de vraag niet direct**. De speler krijgt `MAX_ANSWER_ATTEMPTS = 4` pogingen (eerste poging + 3 retries) binnen dezelfde timer:

- Solo: rood `FOUT — SIGNALEN HERSTELLEN`-veld, ingevuld antwoord wissen, veld opnieuw focusen. De klok (`endsAt`) loopt door; pas bij een geldig antwoord, de vierde fout of het verstrijken van de tijd verschijnt de reveal.
- Kamer: de server slaat elke poging op in `roundAnswers[round][playerId].attempts`, inclusief de reden. Alleen de eigen speler ziet `attemptsLeft` en de laatste fout; andere spelers zien pas `hasAnswered` als het antwoord definitief is. De ronde wordt niet vervroegd zolang iemand nog mag herproberen.
- Punten blijven gelijk aan de eerste geldige poging: retries kosten **geen** punten, maar wel tijd en pogingen. Bij uitputting of timeout: 0 punten, `wrong:true`, rood label.

## 5. Puntberekening

```
base = het eigen gewicht van het herkende antwoord:
  common   → 8–24
  uncommon → 28–49
  rare     → 58–82
  ghost    → 84–100

peer bonus/malus:
  geen dubbelen in kamer (en er zijn peers) → +18
  per echo                                   → −10

correctie:
  één typfout hersteld                       → −3

totaal = clamp(5, 100, base + peer + correctie)
```

Het gewicht wordt door `answerWeight(text, tier)` bepaald: FNV-1a-hash van `"zeron:<tier>:<genormaliseerd antwoord>"` binnen de band, plus een kleine bonus voor lengte en meerdere woorden. Daardoor heeft **elk antwoord zijn eigen puntwaarde**, blijft de volgorde common < uncommon < rare < ghost gewaarborgd en is de uitkomst overal reproduceerbaar.

In solo-modus is `peerAnswers` leeg: de unique-bonus vervalt. In party-modus berekent de **server** de score bij de reveal, met alle antwoorden van die ronde. De client krijgt pas punten te zien na de reveal.

## 6. Labels

| Punten | Label | Kleur |
|---|---|---|
| < 25 | COMMON | grijsblauw |
| 25–49 | UNCOMMON | cyaan |
| 50–83 | RARE | magenta |
| 84–100 | GHOST RARE | lime |
| fout/timeout | Fout / MISSED | rood (`#ff425d`) |

Naast het label toont de UI een neon 'score-buis' die van 0 naar het behaalde aantal punten groeit (`score-lift`). Dat is puur visueel; de score zelf komt altijd van de engine.

## 7. Streaks en dagelijkse run

- Solo streak: +1 bij een antwoord van 75+ punten, anders reset naar 0.
- Run-streak: +1 bij een run van 400+ punten; wordt ook naar een aangemeld account geschreven (`saveRun`).
- Daily seed = `YYYY-MM-DD` (UTC). `seededShuffle` (xorshift-achtig, afgeleid van FNV-1a hash) geeft iedereen dezelfde 7 vragen.
- Question bag: de kamer selecteert vragen uit de volledige pool; herhaling binnen één run is uitgesloten. Communityvragen worden meegenomen; die krijgen een gewogen register uit de sector/tag-bank en worden dus hetzelfde gescoord.

## 8. Voorbeelden

| Antwoord op “Noem iets dat je kunt opblazen.” | Resultaat |
|---|---|
| `ballon` (common) | 9 → COMMON |
| `een ballon` (lidwoord) | zelfde antwoord, 9 → COMMON |
| `balloons` (Engelse vorm, 1 teken verschil) | gecorrigeerd naar `ballon` → 6 → COMMON |
| `een gerucnt` (typo op rare) | gecorrigeerd naar `een gerucht` → 64 → RARE |
| `een rare spinazie` (niet herkend) | **Fout, 0 punten** |
| `een gerucht`, maar 2 spelers | 57 → RARE (echo −10) |
| `het is een ballon` bij `startsWith: 'een'` | **Fout, 0 punten** (regel failt) |

De engine is deterministic: dezelfde invoer geeft altijd dezelfde score, in de browser én op de server.
