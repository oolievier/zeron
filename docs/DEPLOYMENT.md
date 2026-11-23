# Deploying ZERON

De productie-infrastructuur staat al klaar:

| Onderdeel | Waarde |
|---|---|
| GitHub-repo | `zeron` (account `oolievier`) |
| Vercel-project | `zeron` (id `prj_QiuE62I8rV4b6DMtWX38bTrq2vHk`) |
| Vercel-team | `oliviermastenbroek-gmailcom's projects` |
| Blob-store | `zeron-data` (private, id `store_A4YXwkOgkpnbln4U`) |
| Env-var | `BLOB_READ_WRITE_TOKEN` (automatisch door Vercel aan de store gekoppeld) |
| Optionele env-vars | `RESEND_API_KEY`, `ZERON_EMAIL_FROM`, `ZERON_BASE_URL` (zie hieronder) |
| Build | Vite, `npm run build` → `dist/` |
| Node | 22.x lokaal, Vercel runtime 26.x |
| Live URL | **https://zeron-one.vercel.app** |
| Productie-deployment | nieuwste `READY` deployment van `main` (Vercel dashboard) |

## Huidige deploy-flow

1. De productie-deployment is aangemaakt via de Vercel API met `gitSource` = `oolievier/zeron`, branch `main`.
2. `/api/*` draait als Node serverless functions met toegang tot de private Blob-store.
3. Vercel Authentication staat op **preview only**, dus de productie-site is publiek bereikbaar.
4. De kamer-, community- en accountdata staan in Blob; een custom domein kan in het dashboard worden toegevoegd.

### E-mailverificatie

Accounts werken zonder extra configuratie: als `RESEND_API_KEY` ontbreekt, toont de UI na registratie een directe **VERIFICEER NU**-knop (`#/verify/<token>`). Voor echte e-mail:

1. Maak een [Resend](https://resend.com)-key aan en voeg hem als `RESEND_API_KEY` toe aan het Vercel-project (Environment Variables → Production/Preview).
2. Zet `ZERON_EMAIL_FROM` op een geverifieerd afzenderadres (bijv. `ZERON <verification@joudomein.nl>`).
3. Zet `ZERON_BASE_URL` op `https://zeron-one.vercel.app` (of je custom domein), zodat de link in de mail naar productie wijst.

De key wordt nooit gelogd of naar de client gestuurd. Tokens (24 u) en sessies (30 d) worden alleen als hash opgeslagen.

### Automatisch deployen bij pushes

Het Vercel-project bestond al vóór de GitHub-repo en is nog niet via de Git-integratie gekoppeld. Koppel eenmalig:

1. Open `https://vercel.com/oliviermastenbroek-gmailcoms-projects/zeron/settings/git`.
2. Kies **Connect Git repository** → GitHub → `oolievier/zeron`.
3. Produktie-branch: `main`. Build-instellingen staan al op Vite (`npm run build`, output `dist/`).

Daarna bouwt elke push naar `main` automatisch. Tot die tijd: push naar GitHub en maak een deployment met `gitSource` op `main` (of gebruik `npx vercel --prod` na `vercel link`).

## Verificatie

```bash
npm run smoke   # ZERON_URL=https://zeron-one.vercel.app node scripts/smoke-live.mjs
```

De smoke-test controleert `/api/health`, een volledige kamerronde (create → join → start → antwoorden → verborgen antwoorden → reveal → next) en het indienen van een communityvraag. Bij de livegang zijn hierbij drie SDK-aanpassingen gevonden en opgelost: `get()` vereist `access: 'private'`, geeft een stream in plaats van `.text()`, en `put()` vereist `allowOverwrite: true` bij vaste paden.

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
| `/api/account?action=me` | GET | ingelogd account (of 401) |
| `/api/account` | POST | `register`, `verify`, `resend`, `login`, `saveRun`, `logout` |

## Datagroei

Blob-objecten zijn klein (kamers < 20 KB, vragen < 2 KB). Kamers worden niet automatisch opgeruimd; voeg desgewenst een cron toe die `rooms/` objecten ouder dan 24 uur verwijdert via `del()` uit `@vercel/blob`.

## Bekende beperkingen

- Polling i.p.v. WebSockets: ~1,2 s latentie bij het bijwerken van de kamer.
- Blob-schrijven is last-write-wins; gelijktijdige antwoorden van meerdere spelers zijn afzonderlijke mutaties, maar de server verwerkt ze sequentieel per functie-instantie. Voor grote groepen is Redis/Postgres beter.
- Vraaginzendingen worden na basisvalidatie direct `live`. Zonder moderator is misbruik mogelijk; de honeypot en woordfilter beperken dat. Een admin-key of reviewqueue is een eenvoudige volgende stap.
