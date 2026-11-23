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
{ kind: 'listed', hint: 'Antwoord moet in de antwoordlijst van dit signaal staan; één typfout wordt gecorrigeerd.', categoryHint: '…' }
```

De hint wordt in de UI bij de vraag getoond. Een vraag mag extra velden hebben (`startsWith`, `minWords`, `contains`); die worden ná de typo-correctie op het eindantwoord gecontroleerd. Faalt zo'n regel, dan is het antwoord fout — ook al staat het woord in de lijst.

## 3. Typo-correctie

`correctTypo()` probeert alleen woorden van **4+ tekens** te corrigeren naar een woord uit de `common`/`rare` lijst van dezelfde vraag (ook losse woorden van meerwoordige antwoorden). Correctie vindt alleen plaats als er **exact één** kandidaat op bewerkingafstand 1 is (insertie, deletie, substitutie). Meerdere kandidaten of geen kandidaat = geen gok.

`een gerucnt` → `een gerucht` telt dus als rare-antwoord. De UI toont `AUTOCORRECT → …` alleen als de correctie het antwoord daadwerkelijk naar een lijstantwoord heeft gebracht.

## 4. Validatie en fout antwoorden

Afgewezen worden: lege antwoorden, >60 tekens, geen alfanumeriek teken, `aaaaaaaaaa`-achtige herhalingen, links/domeinen.

**Een antwoord dat niet in de `common`/`rare` lijst van de vraag staat, is fout.** Er is geen pseudo-rarity meer. Elk fout antwoord geeft:

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

Iedere vraag heeft een brede lijst: de handgeschreven basis (3 common + 3 rare) wordt aangevuld uit [`src/data/expansions/`](../src/data/expansions/) tot **gemiddeld 26 antwoorden per vraag** (minimaal 24). De lijst is vraagspecifiek: bij een kleurvraag staan alleen kleuren, bij een wachtwoordvraag alleen slechte wachtwoorden. In [`src/data/answer-banks.js`](../src/data/answer-banks.js) zit een generieke sector/tag-bank als terugval voor ingezonden communityvragen. Elk lijstantwoord wordt door de engine geaccepteerd (getest in `tests/scoring.test.js`).

Een antwoord dat niet in de lijst staat, is fout — maar **beëindigt de vraag niet direct**. De speler krijgt `MAX_ANSWER_ATTEMPTS = 4` pogingen (eerste poging + 3 retries) binnen dezelfde timer:

- Solo: rood `FOUT — SIGNALEN HERSTELLEN`-veld, ingevuld antwoord wissen, veld opnieuw focusen. De klok (`endsAt`) loopt door; pas bij een geldig antwoord, de vierde fout of het verstrijken van de tijd verschijnt de reveal.
- Kamer: de server slaat elke poging op in `roundAnswers[round][playerId].attempts`, inclusief de reden. Alleen de eigen speler ziet `attemptsLeft` en de laatste fout; andere spelers zien pas `hasAnswered` als het antwoord definitief is. De ronde wordt niet vervroegd zolang iemand nog mag herproberen.
- Punten blijven gelijk aan de eerste geldige poging: retries kosten **geen** punten, maar wel tijd en pogingen. Bij uitputting of timeout: 0 punten, `wrong:true`, rood label.

## 5. Puntberekening

```
base =
  common-lijst match  → 22
  rare-lijst match    → 82

peer bonus/malus:
  geen dubbelen in kamer (en er zijn peers) → +18
  per echo                                   → −10

bonussen:
  2+ woorden              → +4
  lengte >= 8             → +5
  lengte >= 12            → +4
  op 1 teken van rare-lijst → +8

totaal = clamp(5, 100, base + peer + bonussen)
```

In solo-modus is `peerAnswers` leeg: de unique-bonus vervalt. In party-modus berekent de **server** de score bij de reveal, met alle antwoorden van die ronde. De client krijgt pas punten te zien na de reveal.

## 6. Labels

| Punten | Label | Kleur |
|---|---|---|
| < 35 | COMMON | grijsblauw |
| 35–54 | UNCOMMON | cyaan |
| 55–74 | RARE | magenta |
| 75–100 | GHOST RARE | lime |
| fout/timeout | Fout / MISSED | rood (`#ff425d`) |

Naast het label toont de UI een neon 'score-buis' die van 0 naar het behaalde aantal punten groeit (`score-lift`). Dat is puur visueel; de score zelf komt altijd van de engine.

## 7. Streaks en dagelijkse run

- Solo streak: +1 bij een antwoord van 75+ punten, anders reset naar 0.
- Run-streak: +1 bij een run van 400+ punten; wordt ook naar een aangemeld account geschreven (`saveRun`).
- Daily seed = `YYYY-MM-DD` (UTC). `seededShuffle` (xorshift-achtig, afgeleid van FNV-1a hash) geeft iedereen dezelfde 7 vragen.
- Question bag: de kamer selecteert vragen uit de volledige pool; herhaling binnen één run is uitgesloten. Communityvragen worden meegenomen; die hebben hun eigen `common`/`rare` lijsten en worden dus hetzelfde gescoord.

## 8. Voorbeelden

| Antwoord op “Noem iets dat je kunt opblazen.” | Resultaat |
|---|---|
| `ballon` (common) | 27 → COMMON |
| `een gerucnt` (typo op rare) | gecorrigeerd naar `een gerucht` → 91 → GHOST RARE |
| `een rare spinazie` (niet in lijst) | **Fout, 0 punten** |
| `een gerucht`, maar 2 spelers | 81 → GHOST RARE (echo −10) |
| `het is een ballon` bij `startsWith: 'een'` | **Fout, 0 punten** (regel failt) |

De engine is deterministic: dezelfde invoer geeft altijd dezelfde score, in de browser én op de server.
