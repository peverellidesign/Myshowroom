# myshowroom — by Peverelli Design

Web app multiutente per gli showroom Peverelli Design (Como · Milano Brera · Lugano · Dubai): catalogo prodotti e inventario multi-sede, schede prodotto con gallerie/composizioni/materiali, cataloghi PDF in archivio cloud, clienti, preventivi PDF, invio email con allegati, agenda condivisa con prenotazione online, attività, riserve e assistente di ricerca.

Il design (colori, tipografia, layout, navigazione, schermate) è quello del prototipo v1: stesse classi CSS e stessa struttura; le nuove funzioni usano gli stessi token visivi e sono raccolte in un blocco separato in fondo a `src/style.css`.

## Avvio rapido

```bash
cp .env.example .env          # imposta DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run build
npm start                     # http://localhost:3000
```

Sviluppo con ricompilazione automatica: `npm run dev`.
Con Docker (PostgreSQL incluso): `docker compose up --build`.

Al primo avvio con database vuoto viene creato l'amministratore indicato in `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Con `SEED_DEMO=true` vengono caricati anche i 4 prodotti dimostrativi del prototipo.

## Architettura

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript, bundle esbuild, responsive (iPhone, iPad, desktop), installabile come web app |
| API | Router HTTP su Web API standard (`server/core`), nessun framework: lo stesso codice gira su Node e nel browser (demo) |
| Database | PostgreSQL 14+ (driver `postgres`), schema in `server/schema.sql`, creato automaticamente all'avvio |
| File | Disco locale o object storage S3-compatibile (AWS S3, Cloudflare R2, Backblaze B2, MinIO) con firma SigV4 |
| PDF | `pdf-lib`: preventivi intestati generati lato server |
| Email | SMTP via `nodemailer` (Microsoft 365, Google Workspace, SES, Resend, Postmark…), allegati PDF e invito `.ics` |
| Assistente | Ricerca su inventario reale con sinonimi; opzionale riformulazione con l'API Claude sui soli dati trovati |

## Utenti e ruoli

- **Amministratore** — tutto, più la sezione *Team* (utenti, ruoli, sedi, disattivazione, reset password).
- **Responsabile showroom** — crea/modifica/elimina prodotti, vede tutti i preventivi, gestisce documenti e riserve di tutti.
- **Consulente** — consulta il catalogo, carica cataloghi, gestisce clienti, i propri preventivi, agenda, attività e riserve.

Sessioni con cookie `HttpOnly`/`SameSite=Lax` (14 giorni), password PBKDF2-SHA256 (210.000 iterazioni), protezione CSRF, limite tentativi di login. Disattivare un utente o cambiare password chiude le sue sessioni.

## Funzioni principali

- **Cataloghi PDF**: upload fino a `MAX_UPLOAD_MB` (default 100 MB), condivisi con tutto il team, collegabili a più prodotti, apertura/download, link esterni.
- **Preventivi**: ogni consulente ha la propria bozza; numerazione `PD-AAAA-NNNN`; PDF intestato; invio email con PDF e cataloghi allegati (oltre 20 MB i cataloghi diventano una nota nel testo); storico con stato di consegna; duplicazione.
- **Agenda**: condivisa per sede, controllo conflitti di fascia oraria lato database, consulente assegnato, conferma email con invito calendario.
- **Prenotazione online**: `/book/como`, `/book/lugano`, `/book/milano`, `/book/dubai` mostrano solo gli orari liberi.
- **Senza SMTP** le email non vengono consegnate: l'app lo indica chiaramente e il PDF resta scaricabile.

## Pubblicazione: Supabase (database + file) e Render (app)

Supabase non serve pagine web (HTML convertito in testo), quindi l'app gira su un servizio Node separato; tutti i dati restano su Supabase.

**1. Supabase** (supabase.com → New project, regione europea)
- *Connect → Session pooler*: copia la stringa di connessione → `DATABASE_URL` (con la password del database).
- *Storage → New bucket*: nome `myshowroom`, **privato**.
- *Storage → Settings → S3*: copia endpoint e regione, crea una *access key*.
- Le tabelle le crea l'app al primo avvio.

**2. Render** (render.com → New → Blueprint → `peverellidesign/Myshowroom`, ramo `myshowroom-v2`)
- `render.yaml` crea solo il servizio web (piano free: si sospende dopo 15 minuti di inattività; `starter` per tenerlo sempre attivo).
- Compila i valori richiesti: `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Facoltativo, dopo: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` per l'invio email; dominio personalizzato da *Settings → Custom Domains*.

Le stesse variabili funzionano su qualsiasi altro host Node 22 (GoDaddy Node.js Hosting, Railway, Fly.io…): build `npm install --include=dev && npm run build`, avvio `npm start`.

## Caricare i contenuti

- **Prodotti** (amministratore / responsabile): *Prodotti → Nuovo prodotto* oppure *Modifica scheda*: dati, composizioni con prezzi, materiali, colori, più foto per volta (dal telefono anche scattandole), scelta della copertina.
- **Cataloghi PDF** (tutti): scheda prodotto → *Cataloghi & Documenti* → carica PDF o link; *Collega un catalogo già caricato* per associarlo ad altri prodotti.
- **Clienti, appuntamenti, attività, utenti** dalle rispettive sezioni (*Team* solo per l'amministratore).

## Test

```bash
npm test          # firma S3 (vettori AWS) + 12 test end-to-end API su PostgreSQL reale con server SMTP di test
npm run test:e2e  # interfaccia su desktop, iPad e iPhone (Playwright), con screenshot
```

`TEST_DATABASE_URL` indica il database di test (viene svuotato a ogni esecuzione).

## Demo autonoma

`npm run build:demo` produce `demo-dist/index.html`: un unico file in cui il server gira nel browser (dati e PDF nell'IndexedDB del dispositivo, email registrate ma non inviate). Serve solo per far provare l'interfaccia; non è condivisa tra utenti.
Credenziali demo: `admin@peverelli.demo` / `myshowroom-demo` (consulente: `giulia@peverelli.demo`).

## Da completare prima della produzione

- Sostituire le immagini dimostrative (Unsplash) e i prezzi indicativi con foto e listini verificati.
- Configurare SMTP con un mittente autenticato (SPF/DKIM) e lo storage S3/R2.
- Gli indirizzi degli showroom negli inviti calendario sono generici (`Peverelli Design — Como`): aggiornarli in `server/core/app.ts`.
- Servire l'app dietro HTTPS (es. Caddy, Nginx, Fly.io, Render, Railway) con `NODE_ENV=production`.
