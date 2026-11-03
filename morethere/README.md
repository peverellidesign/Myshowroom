# morethere — independent React reconstruction

This is a **new implementation** based on the product and screenshots discussed in ChatGPT. It is **not** an export of the original Replit repository.

## Run

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Production build: `npm run build`.

## Included
- Mobile-first white / charcoal / Roboto visual system
- Save links and notes; search and filters; collections
- Your Circle entry, sample friends' worlds
- Thought of You: prepare and share personal dedication
- Our Little World: locally saved shared-world prototypes
- AI context export to clipboard
- Enter My World: UX prototype for sharing

## Important limitations
- LocalStorage is used for persistence; it is **not** a multi-user database.
- Sample friend profiles and their collections are illustrative.
- Access controls, identity, secure invitations, real-time sync, notifications and collaborative editing are **not implemented**. The sharing settings are a visual prototype and do not confer access.
- Do not deploy this as a real private social app without implementing authentication, server-side authorization, secure invitation tokens, row-level security, rate limiting, privacy and abuse controls.
- External URLs are validated to HTTP(S) before opening. Metadata previews and image upload require further development.

## Claude handoff

Upload this entire ZIP to Claude and ask:

> Continue developing this existing React/Vite project. Preserve its visual design and current functionality. Replace demo-only social features with a production-grade Supabase implementation: authentication, user profiles, connection requests, collection and item permissions, revocable invitations, private world access, item dedications, shared collaborative collections, real-time updates, and consent-gated AI exports. Design SQL migrations with row-level security policies and tests. Keep all existing local data through a consent-based migration. Do not claim that the social features are secure until authorization tests pass.
