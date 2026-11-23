# Deploying ZERON

De productie-infrastructuur staat al klaar:

| Onderdeel | Waarde |
|---|---|
| GitHub-repo | `zeron` (account `oolievier`) |
| Vercel-project | `zeron` (id `prj_QiuE62I8rV4b6DMtWX38bTrq2vHk`) |
| Vercel-team | `oliviermastenbroek-gmailcom's projects` |
| Blob-store | `zeron-data` (private, id `store_A4YXwkOgkpnbln4U`) |
| Env-var | `BLOB_READ_WRITE_TOKEN` (automatisch door Vercel aan de store gekoppeld) |
| Build | Vite, `npm run build` → `dist/` |
| Node | 22.x lokaal, Vercel project gebruikt 26.x |

## Flow

1. Push naar `main` op GitHub.
2. Vercel Git-integratie bouwt en deploy automatisch.
3. `/api/*` draait als Node serverless functions met toegang tot de Blob-store.
4. De site is bereikbaar op het Vercel-project-domein; een custom domein kan in het dashboard worden toegevoegd.

## Lokaal

```bash
npm install
npm run dev
```

Zonder Vercel-token gebruikt de API de in-memory store. Wil je lokaal tegen echte Blob-data aan praten, zet dan `BLOB_READ_WRITE_TOKEN` in een niet-ingecheckte `.env.local` (Vercel CLI `vercel env pull`).

## Endpoints

| Route | Method | Doel |
|---|---|---|
| `/api/health` | GET | status, storage-modus, aantal basisvragen |
| `/api/questions` | GET | bibliotheek-info + communityvragen |
| `/api/questions` | POST | nieuwe vraag indienen |
| `/api/room?code=…&playerId=…` | GET | openbare kamerstatus |
| `/api/room` | POST | `create`, `join`, `start`, `answer`, `reveal`, `next`, `rematch`, `leave` |

## Datagroei

Blob-objecten zijn klein (kamers < 20 KB, vragen < 2 KB). Kamers worden niet automatisch opgeruimd; voeg desgewenst een cron toe die `rooms/` objecten ouder dan 24 uur verwijdert via `del()` uit `@vercel/blob`.

## Bekende beperkingen

- Polling i.p.v. WebSockets: ~1,2 s latentie bij het bijwerken van de kamer.
- Blob-schrijven is last-write-wins; gelijktijdige antwoorden van meerdere spelers zijn afzonderlijke mutaties, maar de server verwerkt ze sequentieel per functie-instantie. Voor grote groepen is Redis/Postgres beter.
- Vraaginzendingen worden na basisvalidatie direct `live`. Zonder moderator is misbruik mogelijk; de honeypot en woordfilter beperken dat. Een admin-key of reviewqueue is een eenvoudige volgende stap.
