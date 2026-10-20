# myshowroom — by Peverelli Design

**Your showroom. Everywhere.**

myshowroom is the showroom operating system for Peverelli Design consultants. It
combines a visual product catalogue, real inventory across showrooms and warehouses,
manufacturer catalogues (PDF), client CRM, reservations, quotations with PDF output,
email, appointment booking and an AI search assistant, in a responsive web app (PWA)
for desktop, iPad and smartphones. The interface is in Italian.

---

## Stack

| Layer | Technology |
|---|---|
| App | Next.js 15 (App Router, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS, custom component kit in the shadcn/ui style, lucide icons, Inter |
| Data | PostgreSQL 16 + Prisma 6 |
| Auth | Email/password (bcrypt), server-side sessions in the DB, httpOnly cookie |
| Files | Private storage on disk (`STORAGE_DIR`), served only through authorised routes |
| PDF | `pdfkit` + `sharp` (quotations, server-side), `pdf.js` (embedded viewer) |
| Email | SMTP via `nodemailer` |
| AI | Anthropic Claude (`@anthropic-ai/sdk`, tool use over the real inventory), with a deterministic fallback |
| PWA | Web manifest, service worker (static assets + offline page) |

## Getting started

Requirements: Node.js 20+, PostgreSQL 14+ (with the `btree_gist` extension, included in standard PostgreSQL).

```bash
cp .env.example .env              # then edit the values
npm install                        # also copies the pdf.js worker and generates the Prisma client
npx prisma migrate deploy          # creates the schema and the integrity constraints
npm run db:seed                    # demo data + users (prints the passwords if they were generated)
npm run dev                        # http://localhost:3000
```

Production: `npm run build && npm start` (run `npm run db:deploy` on every release).

### Initial users

The seed creates an administrator (`SEED_ADMIN_EMAIL`, password from `SEED_ADMIN_PASSWORD`
or generated and printed) and four demo users that share `SEED_DEMO_PASSWORD`:

| Email | Role |
|---|---|
| `manager@peverellidesign.com` | Manager |
| `consulente@peverellidesign.com` | Sales consultant (Lugano) |
| `consulente.como@peverellidesign.com` | Sales consultant (Como) |
| `magazzino@peverellidesign.com` | Warehouse staff |

Change these passwords, or deactivate the demo users, under **Amministrazione → Utenti e ruoli**.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Public base URL |
| `STORAGE_DIR` | Directory for uploaded images and PDFs (back it up; keep it outside the web root) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Email sending. With `SMTP_HOST` empty, sending is disabled and the UI says so; drafts can still be saved and copied |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Ask myshowroom AI mode (default model `claude-opus-5-5`). Without a key the assistant uses the structured-search fallback, labelled as such |
| `CRON_SECRET` | Protects `POST /api/cron/reminders` (appointment reminders, 24 h ahead). Call it hourly with `Authorization: Bearer $CRON_SECRET` |
| `SEED_*` | Used only by `npm run db:seed` |

Credentials are only ever read from the environment; nothing secret is stored in the database or in the code.

## Modules

- **Home**: search, showrooms, counts (displayed / warehouse / reserved / new), quick actions, upcoming appointments, open quotations, reminders, displayed and recent products.
- **Prodotti**: grid and list views, search, filters (location, category, status, brand, availability, price, material, colour, width, favourites), sorting, comparison of up to 4 models, new model.
- **Scheda prodotto**: gallery with views, thumbnails, full screen and zoom; tabs *Panoramica · Galleria · Composizioni · Materiali & Colori · Disponibilità · Prezzi · Cataloghi & Documenti*; actions *Aggiungi al preventivo, Riserva prodotto, Confronta, Preferiti, Condividi, Apri catalogo*.
- **Cataloghi & Documenti**: real PDF upload (with progress) to persistent storage, title, category, language, brand, association with several products and an optional start page per product, embedded viewer (page navigation, zoom, full screen, download, metadata), duplicate detection by checksum (the same PDF is linked, never copied), versions with history and restore, confidential price lists.
- **Showroom & Stock**: visual browsing by location, physical items with code, composition, exact finishes, dimensions, quantity, zone, status, price, discount, real photos and notes; edit, transfer (in transit → arrival confirmed, or immediate), status changes, movement history.
- **Prenotazioni**: client, quantity, expiry, notes; release, mark as sold; automatic expiry.
- **Clienti**: CRM record, products of interest, showroom visits (convertible into a pre-filled quotation and a follow-up), appointments, quotations, reservations, tasks, communication history.
- **Preventivi**: active quotation per consultant (header bag), lines from stock / manufacturer configuration / base model / free text, quantities, prices, line and global discounts, transport, installation, VAT, notes, EUR/CHF with frozen exchange rate, statuses, duplication, revisions, branded PDF.
- **Email**: composer with five Italian templates, quotation preview, PDF attachment, delivery status and history.
- **Agenda**: day, week, upcoming and history views; create, reschedule (history kept), cancel, complete; automatic assignment of a free consultant; public booking at `/book/<location>` (e.g. `/book/como`, `/book/lugano`).
- **Attività**: tasks with deadline, priority, assignee, and links to a client, appointment or quotation.
- **Ask myshowroom**: questions in natural language; results always come from the real inventory and are clickable, with a direct "add to quotation" action.
- **Amministrazione**: users and roles, locations, zones and consultant availability, brands, categories, materials and finishes, active reservations, EUR/CHF exchange rate (manual or verified from the ECB), email settings, cover image, audit log.

## Data model and integrity

`prisma/schema.prisma` separates **ProductModel** (what the manufacturer offers, with
configurations and compatible materials/finishes) from **InventoryItem** (a physical piece
in a real location). The UI only says *"Disponibile in stock Peverelli"* when at least one
inventory record supports it; otherwise it shows *"Disponibile su ordinazione dal produttore"*.

Rules enforced by the database (`prisma/migrations/*_integrity`):

- trigger `reservation_capacity_guard`: active reservations can never exceed the physical quantity, and pieces that are sold, unavailable or in transit cannot be reserved;
- exclusion constraint `appointment_no_consultant_overlap`: no overlapping confirmed appointments for the same consultant;
- check constraints on quantities, discounts (0–100 %), prices and time ranges.

In the application: reservations lock the inventory row (`SELECT … FOR UPDATE`),
bookings are serialised per location (`pg_advisory_xact_lock`), and every important
operation is written to `AuditLog`.

## Security and permissions

Roles: **Amministratore, Manager, Consulente vendite, Magazzino**. Permissions
(`src/lib/permissions.ts`) are checked on the server in every Server Action and API
route; the UI only hides controls. Confidential documents are filtered out of queries
and refused by the file route. Uploads are validated by content (magic bytes), not by
the declared type. Password hashes are left out of every query by default. Login is
throttled per account.

## Deploying on Railway (public link)

The repository includes `railway.json`. On every deploy Railway builds the app
(`npm run build`) and starts it with `npm run start:railway`, which applies the
migrations, seeds an empty database once, then starts Next.js on `$PORT`.

1. railway.com → New project → Deploy from GitHub repo → this repository and branch.
2. In the project: **+ New → Database → PostgreSQL**.
3. On the app service: **Settings → Volumes → Add volume**, mount path `/data`.
4. App service **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `STORAGE_DIR` = `/data`
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD`
   - optional: `SMTP_*`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
5. **Settings → Networking → Generate domain** to get the public URL.

## Real Peverelli catalogue

`prisma/import-catalog.ts` imports the showroom selection transcribed from the
Peverelli PDF ("Opportunità | Selezione showroom"): 58 physical pieces, 54 models,
14 brands, with their photos, list and discounted prices, and the PDF itself linked
to every product at its page. The data lives in `prisma/seed-data/` (`catalog.json`,
`images/`, the PDF). When this folder is present, `npm run db:seed` imports the real
catalogue (also on the first Railway deploy); otherwise it creates the demonstration
data below.

The PDF does not say where each piece is: the import places CHF-priced pieces in
**Lugano** and EUR-priced pieces in **Como**, and says so in each piece's notes.
Correct the location from the piece's page (Stock → piece → Modifica / Trasferisci).

## Demo data

The seed creates illustrative data for B&B Italia *Le Bambole*, Vitra *EM Table*,
Maxalto *Artemone* and Maxalto *Lithos*, with pieces in Como, Lugano and the warehouses.
**All of it is demonstration data** (marked "Demo" in the UI): locations, prices,
finishes, configurations and statuses do not come from Peverelli records or from
official catalogues. The product images are original schematic illustrations, and no
manufacturer catalogue is bundled: upload the real documents from each product page.

To start from real data, create brands, materials and locations in Amministrazione,
then the product models and the physical pieces, or import them directly into the
documented PostgreSQL tables.

## Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Demo data (only on an empty database) |
| `npm run db:reset` | **Wipes** the database, then re-seeds it |
