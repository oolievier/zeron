# Bronanalyse — PlayAscent, Krillion, PlayPlain

ZERON is niet gekopieerd van een bestaand spel, maar de **mechanische lessen** van drie sites zijn wel bestudeerd. Alle rapporten hier zijn opgesteld met **statische analyse**: HTML/CSS/JS lezen, geen browser, geen uitvoering van de sites, geen network calls naar de spelservers.

| Rapport | Bron | Methode | Focus |
|---|---|---|---|
| [PLAYASCENT.md](PLAYASCENT.md) | `http://playascent.online/` (single-file, 3,4 MB) | REA CLI + handmatige codelezing | 7×25 s, rarity-engine, question bag, tolerant antwoordmatchen, localStorage |
| [KRILLION.md](KRILLION.md) | `https://krillion.io` + 8 subroutes | curl + codelezing | daily dive, zes tiers, streaks, archive, vrienden, party mode, CRT/ocean |
| [PLAYPLAIN.md](PLAYPLAIN.md) | `https://playplain.app` (single page, 205 KB) | statische HTML/CSS/JS-lezing | 7 targets/day, closest-answer ranks, daily/archives/locales |
| [ascent-rea-summary.json](ascent-rea-summary.json) | REA CLI output | `npx -y rea-agents@latest analyze-javascript-application` | 4 JS-bestanden, 7.496 AST-nodes, 15 findings |

De volledige REA-evidence (11 MB) staat bewust niet in de repo; de samenvatting wel.

## Wat ZERON ervan overneemt (en wat niet)

| Mechaniek | Herkomst | ZERON-implementatie |
|---|---|---|
| 7 signals/day, vaste seed | alle drie | Daily Signal-mode met UTC-datum als seed; blitz heeft willekeurige seed |
| 25 seconden per vraag | PlayAscent, Krillion | instelbaar 10–60 s, standaard 25 s |
| Rarity i.p.v. “goed/fout” | PlayAscent, Krillion | 5–100 punten, COMMON → GHOST RARE; deterministisch, geen AI |
| Tolerant antwoordmatchen | PlayAscent, Krillion | unieke edit-distance-1 correctie + normalisatie |
| Question bag / anti-herhaling | PlayAscent | seeded shuffle zonder herhaling binnen een run |
| Archief en question library | PlayPlain, Krillion | doorzoekbare archive-pagina over 224+ vragen |
| Community-vragen | nieuw | `/api/questions` schrijft direct naar gedeelde Blob-store |
| Realtime party | Krillion (hot potato) | eigen server-authoritatieve kamers, verborgen antwoorden, polling |
| Streaks, debrief, share | Krillion, PlayAscent | solo-streak, result-scherm, copy-to-clipboard |
| Visuele stijl | geen | volledig eigen cyberpunk HUD: scanlines, neon, glitch, orbits; geen template/UI-kit |

## Bewuste afwijkingen

- Geen advertenties, GA4 of consent-laag; ZERON heeft geen tracking.
- Geen betaalde packs of mascottes; alle sectoren en vragen zijn vrij toegankelijk.
- Geen strikte antwoordlijst: een onbekend antwoord krijgt een deterministische pseudo-rarity score.
- Geen “dive”-animatie met fysieke diepte; de cyberpunk-versie gebruikt een rarity-meter en sector-tags.
- Geen accounts: een willekeurige lokale speler-id is genoeg voor kamers en statistieken.
