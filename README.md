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

All'avvio vengono importati una sola volta i cataloghi preparati in `server/import/<nome>/` (`products.json` + foto): attualmente `expo-2026-10`, 58 prodotti dal PDF «Opportunità | Selezione showroom» (CHF → Lugano, EUR → Como; prezzo = prezzo Peverelli, listino nella descrizione). I prodotti modificati o eliminati in seguito non vengono reimportati. `SKIP_CATALOG_IMPORT=true` disattiva l'importazione.

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

## Pubblicazione consigliata: Render + Supabase (3 valori)

Il progetto Supabase `myshowroom` è già pronto (tabelle con Row Level Security e bucket privato `myshowroom`).
L'app usa l'API HTTPS di Supabase sia per i dati sia per i file: basta la **secret key**.

1. render.com → accedi con GitHub → **New → Blueprint** → `peverellidesign/Myshowroom`, ramo `myshowroom-v2`.
2. Inserisci `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → Secret key), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
3. **Apply**. Dopo qualche minuto l'app è online su `https://myshowroom-….onrender.com`.

Email: senza SMTP le email vengono registrate ma non consegnate; aggiungere in seguito `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
Dominio: Render → Settings → Custom Domains, poi `PUBLIC_URL=https://tuodominio`.

## Altre piattaforme

### GoDaddy Node.js Hosting con Supabase

GoDaddy consente alle app solo traffico web in uscita (HTTPS) e un proprio servizio email interno: per questo l'app usa l'**API HTTPS di Supabase** (non la connessione diretta al database) e il **gateway email di GoDaddy** (non SMTP). Tutto è già previsto nel codice.

**1. Supabase**
- *SQL Editor → New query*: incolla il contenuto di `server/schema.sql` e premi **Run** (una sola volta). Crea le tabelle con Row Level Security attiva.
- *Project Settings → API Keys*: copia **Project URL** → `SUPABASE_URL` e la **secret key** (`sb_secret_…`, oppure la legacy `service_role`) → `SUPABASE_SECRET_KEY`. Non usare la chiave *publishable/anon*.
- *Storage*: bucket privato `myshowroom`; in *Settings → S3* endpoint, regione e access key.

**2. GoDaddy** (godaddy.com/nodejs → *Connect GitHub* → repository `peverellidesign/Myshowroom`, ramo `myshowroom-v2` → *I need to add secrets for my app to boot*)

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
STORAGE=s3
S3_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3
S3_REGION=<regione del progetto>
S3_BUCKET=myshowroom
S3_PATH_STYLE=true
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
MAX_UPLOAD_MB=50
MAIL_PROVIDER=godaddy
APP_SECRET=<stringa casuale lunga>
ADMIN_EMAIL=…
ADMIN_PASSWORD=…            # almeno 10 caratteri
SEED_DEMO=true
```

**Non** impostare `DATABASE_URL` su GoDaddy: la connessione diretta al database è bloccata dalla piattaforma.
*Import & Deploy* → prova l'anteprima → *Publish Now* → dominio da *Settings*. Dopo aver collegato il dominio aggiungi `PUBLIC_URL=https://tuodominio` (usato nei link di download inviati per email).

Email su GoDaddy: il mittente è scelto dal gateway (dominio dell'app o dominio verificato); massimo 10 allegati da 2 MB ciascuno. I PDF più grandi vengono inviati come link di download firmati, validi 60 giorni.

## Email da Outlook / Microsoft 365

L'app invia le email dalla casella Microsoft 365 indicata in `MAIL_FROM` tramite **Microsoft Graph** (HTTPS): funziona anche dove le porte SMTP sono bloccate (Railway Hobby) e non usa la vecchia autenticazione SMTP con password, che Microsoft sta disattivando. Le email inviate finiscono nella *Posta inviata* di quella casella.

1. entra.microsoft.com → *App registrations* → *New registration* (nome `myshowroom`, solo questo tenant).
2. *API permissions* → *Add a permission* → *Microsoft Graph* → *Application permissions* → `Mail.Send` → *Grant admin consent*.
3. *Certificates & secrets* → *New client secret* → copia il **Value**.
4. Variabili: `MAIL_PROVIDER=microsoft`, `MS_TENANT_ID` (Directory/tenant ID), `MS_CLIENT_ID` (Application/client ID), `MS_CLIENT_SECRET`, `MAIL_FROM=Peverelli Design <showroom@tuodominio>`.

Consigliato: limitare l'app alla sola casella dello showroom (Exchange Online → *RBAC for Applications*). Allegati fino a 20 MB ciascuno (25 MB totali); oltre diventano link di download firmati. Gli account Outlook.com personali non sono supportati.

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
