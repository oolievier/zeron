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

## 2. Typo-correctie

`correctTypo()` probeert alleen woorden van **4+ tekens** te corrigeren naar een antwoord uit de `common`/`rare` lijst van dezelfde vraag. Correctie vindt alleen plaats als er **exact één** kandidaat op bewerkingafstand 1 is (insertie, deletie, substitutie). Meerdere kandidaten of geen kandidaat = geen gok. De UI toont een `AUTOCORRECT → …` notitie als het antwoord is aangepast.

## 3. Validatie

Afgewezen worden: lege antwoorden, >60 tekens, geen alfanumeriek teken, `aaaaaaaaaa`-achtige herhalingen, links/domeinen. Vragen kunnen extra regels hebben (`startsWith`, `minWords`); die worden ook server-side gecontroleerd voor kamerantwoorden.

Een onbekend maar geldig antwoord is **geen fout**: het krijgt een pseudo-rarity score. Dat is bewust anders dan een strikte quiz en vergelijkbaar met de inspiratiebronnen.

## 4. Puntberekening

```
base =
  common-lijst match  → 22
  rare-lijst match    → 82
  anders              → 34 + floor(hash32(question.id + "|" + antwoord) % 100 * 0.38)
                          (= 34..71, deterministisch)

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

In solo-modus is `peerAnswers` leeg: purity/unique bonus vervalt en de pseudo-rarity bepaalt de basis. In party-modus berekent de **server** de score bij de reveal, met alle antwoorden van die ronde. De client krijgt pas punten te zien na de reveal.

## 5. Labels

| Punten | Label | Kleur |
|---|---|---|
| < 35 | COMMON | grijsblauw |
| 35–54 | UNCOMMON | cyaan |
| 55–74 | RARE | magenta |
| 75–100 | GHOST RARE | lime |
| afgewezen/timeout | REJECTED / MISSED | rood |

## 6. Streaks en dagelijkse run

- Solo streak: +1 bij een antwoord van 75+ punten, anders reset naar 0.
- Run-streak in `localStorage`: +1 bij een run van 400+ punten.
- Daily seed = `YYYY-MM-DD` (UTC). `seededShuffle` (xorshift-achtig, afgeleid van FNV-1a hash) geeft iedereen dezelfde 7 vragen.
- Question bag: de kamer selecteert vragen uit de volledige pool; herhaling binnen één run is uitgesloten. Communityvragen worden meegenomen.

## 7. Voorbeelden

| Antwoord op “Noem iets dat je kunt opblazen.” | Base | Extra | Totaal (indicatie) |
|---|---|---|---|
| `ballon` (common) | 22 | +5 (lengte) | 27 → COMMON |
| `een gerucht` (rare) | 82 | +4 +5 | 91 → GHOST RARE |
| `een rare spinazie` (onbekend) | 34–71 | +4 +5 +4 | 47–84 |
| `een gerucht`, maar 2 spelers | 82 | +4 +5 −10 | 81 → GHOST RARE |

De exacte waarde van een onbekend antwoord hangt af van de hash van antwoord + vraag-id; dezelfde combinatie geeft altijd hetzelfde resultaat.
