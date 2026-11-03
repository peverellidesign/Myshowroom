# morethere

**Your world. Your people. Your intelligence.**

A place to collect what matters, discover through people you trust, and turn
personal and shared knowledge into action with AI.

Mobile-first React (Vite) app with a Supabase backend: authentication, a private
personal archive, trusted connections, revocable sharing, Thought of You
messages, collaborative worlds, realtime sync and a consent-aware AI Context
Builder.

---

## Features

| Feature | What it does | Enforced on the server by |
|---|---|---|
| Account | Email + password sign-up/sign-in, password reset, sign-out, account deletion | Supabase Auth; `delete_my_account()` |
| Personal archive | Save links and notes, search, filter by category/collection, create collections, move items, delete | RLS on `items`/`collections`: owner only |
| Private by default | No one sees anything unless you grant it | Every policy starts from `owner_id = auth.uid()` |
| Your Circle | Connect by `@handle` or a personal invite link; accept/decline requests; remove people | `request_connection`, `respond_connection`, `remove_connection` |
| Invitations | Single-use, 7-day, revocable links. Only a SHA-256 hash is stored. The token travels in the URL fragment, so it never reaches a server log | `create_invitation`, `accept_invitation`, `revoke_invitation` |
| Enter my world | Grant one connection access to selected collections or your entire world, read-only or read-and-copy, with or without AI export. Revoke at any time | `world_shares` + `world_share_collections`, `can_view_item()` |
| Their worlds | Browse what a connection shared with you; save copies when allowed | RLS on `items`; `save_shared_item()` checks `can_save` |
| Thought of you | Send one of your discoveries with a dedication to a connection (they receive a snapshot, not access to your archive), or share outside morethere with the device share sheet as before | `send_thought()`: connection and ownership checks |
| Our little world | Shared collections: invite connections, they accept, everyone contributes; owner manages members | `world_members` status/role, `add_item_to_world()` |
| AI Context Builder | Copy your own content as AI context (same format as the prototype). Shared content is included only when its owner allowed it: per grant, per thought, and per world member for their own contributions | `ai_export_shared`, `ai_export_thoughts`, `ai_export_world` |
| Sync | Changes appear live on every device and for every person who may see them | Supabase Realtime (`postgres_changes`, filtered by RLS) |
| Data portability | Download all your data as JSON | `export_my_data()` |
| Local data import | Data saved by the earlier prototype (`localStorage` `mt_*`) is offered for import after sign-in. Nothing is uploaded without the person tapping **Importa** | client-side, idempotent via `items.client_ref` |

If `VITE_SUPABASE_*` is not set, the app runs in **local-only mode**, the
original prototype behaviour: personal archive and AI export on this device,
with social features asking you to connect a backend.

## Project layout

```
index.html
src/
  main.jsx           entry
  Root.jsx           auth gate, invite-link capture, local vs. backend mode
  App.jsx            all screens (home, circle, friend, worlds, world, detail, thought, settings, profile, export)
  style.css          original visual system + additions using the same tokens
  lib/api.js         Supabase data layer (one function per operation)
  lib/local.js       local-only store + legacy data reader
  lib/ai.js          AI Context Builder
  lib/supabase.js    client
supabase/
  config.toml
  migrations/20261103000000_morethere_core.sql   schema, RLS, RPCs, realtime
tests/
  authz.test.mjs     16 API-level authorization tests (real users, real stack)
  e2e.test.mjs       9 browser tests: two people using the app end to end
```

## Run locally

Requires Node 20+ and Docker.

```bash
npm install
npx supabase start            # local Postgres, Auth, REST, Realtime
npx supabase status -o env    # shows API_URL and ANON_KEY
cp .env.example .env.local    # set VITE_SUPABASE_URL=API_URL, VITE_SUPABASE_ANON_KEY=ANON_KEY
npm run dev                   # http://localhost:5173
```

Local sign-ups are confirmed immediately. Emails (password reset) appear in
Mailpit at http://127.0.0.1:54324.

### Tests

```bash
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

npm run test:authz                              # authorization (RLS + RPCs + realtime filtering)
npm run dev &                                   # with .env.local pointing at the same stack
APP_URL=http://127.0.0.1:5173 npm run test:e2e  # Playwright, two browsers
```

After `npx supabase db reset`, wait a few seconds for Realtime to restart
before you run the realtime test.

## Live deployment

| | |
|---|---|
| App | https://morethere-production.up.railway.app |
| Railway | project **morethere** (separate from myshowroom), service `morethere`, root directory `/morethere`, branch `claude/myshowroom-app`, redeploys on changes under `morethere/` |
| Supabase | project **morethere** (`ptcexacciemeiykavbpb`, eu-west-3) |
| Build-time variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key) |

The app is served by `server.mjs` (static files, SPA fallback, CSP and security headers, `/health`).

## Deploy to production

1. **Create a Supabase project** for morethere. Don't reuse another app's project.
2. **Apply the schema**: `npx supabase link --project-ref <ref>` and then `npx supabase db push`.
3. **Auth settings** (Dashboard → Authentication):
   - *URL configuration*: set Site URL to your domain and add it to Redirect URLs (needed for confirmation and password-reset links).
   - *Providers → Email*: keep **Confirm email** on and set the minimum password length to 8 or more.
   - Turn on leaked-password protection, and configure a custom SMTP sender for reliable delivery.
4. **Build the frontend** with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or the publishable key) and host `dist/` on any static host (Vercel, Netlify, Cloudflare Pages, Render static site). The anon key is meant for browsers: every request is authorized by RLS. **Never ship the service-role key to the client.**
5. Serve over HTTPS. A strict CSP is recommended: `default-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; font-src https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'`.

## Security model

- **Default deny.** RLS is enabled on every table. Anonymous users have no table privileges and cannot execute any function.
- **Explicit, revocable grants.** Reading another person's items requires a live `world_shares` row *and* an accepted connection. Removing a connection deletes all grants between the two people in the same transaction.
- **Cross-user writes go through `SECURITY DEFINER` RPCs** with `search_path = ''` (connections, invitations, thoughts, world membership, copying shared items). Direct `INSERT`/`UPDATE` on those tables is revoked.
- **Policy helpers live in a `private` schema** that the Data API doesn't expose, so questions like "are A and B connected?" can't be asked over HTTP.
- **Snapshots, not access.** Thoughts and world items copy the content, so recipients never gain read access to the sender's archive.
- **Column-level privileges**: users can update only `handle/display_name/subtitle` on their profile and only `name` on a world. Invitation `token_hash` isn't readable.
- **Rate limits** in the database: 30 connection requests/day, 20 invitations/day, 100 thoughts/day, 30 invitation acceptances/hour.
- **Input validation** with CHECK constraints: lengths, `http(s)` URLs only, handle format.

### Known limits

- AI-export consent is enforced on the export path (the server returns only permitted rows). Someone who can *read* shared content can still copy it by hand, as with any sharing.
- Realtime `DELETE` events carry only the primary key and aren't filtered by RLS (a Supabase Realtime limitation). The client reacts by re-reading through RLS, so no content leaks, but a subscriber can learn that *some* row id was deleted.
- Link previews (title/image metadata) and image upload aren't implemented yet. Links are stored with the hostname as their title, as in the prototype.
- Thoughts shared *outside* morethere (device share sheet) are recorded only on that device, as before.
