# AGENTS.md

## Cursor Cloud specific instructions

Pergamum is a single Next.js 15 (App Router) app — the AI-assisted essay writer. There is only one local process (the Next.js dev server on port 3000); every other backend (Supabase, Stripe, Vercel AI Gateway, Exa, LlamaParse, OpenAlex) is a hosted SaaS accessed over HTTPS. There is no docker-compose, Makefile, or local database.

### Running / testing / building
Standard scripts live in `package.json` and setup is documented in `README.md` / `SETUP.md`. Key commands: `npm run dev` (dev server on `http://localhost:3000`), `npm run build`, `npm start`, `npm run lint`. There is no automated test suite in this repo.

### Non-obvious caveats
- **The app currently runs in hard-coded guest-only mode** (`GUEST_ONLY_MODE = true` in `lib/config/guest-only.ts`). Because of this, `/` redirects to `/guest/project/local/blueprint`, the root middleware never touches Supabase, and the whole Blueprint → Outline → Draft → References → Export flow works fully client-side using `localStorage` (`lib/guest/storage.ts`). This means **you can run and demo the core product with no secrets at all**.
- **AI features degrade gracefully to stub content when `AI_GATEWAY_API_KEY` is unset.** The AI routes catch the "AI is not configured" error and return placeholder text (e.g. drafts literally say "Replace this scaffold with LLM output"). This is expected without a key — it is not a bug. Set `AI_GATEWAY_API_KEY` (Vercel AI Gateway) to get real DeepSeek V4 Flash output.
- To exit guest-only mode and exercise real auth/projects/billing you need real secrets: the three Supabase vars, Stripe keys, and `AI_GATEWAY_API_KEY`, plus applying the two SQL migrations in `supabase/migrations/` to a Supabase project and configuring its Auth redirect URLs (see `SETUP.md`). None of that is required just to run the app.
- `.env.local` is git-ignored. Copying `.env.example` to `.env.local` (dummy values) is enough for the guest demo; the placeholder Supabase URL/keys never get exercised in guest-only mode.
- `npm run dev` first runs `scripts/clean-next-cache.mjs`, which deletes `.next` before starting. Use `npm run dev:fast` to skip the cache clean.
- Reaching a guest workspace page directly can bounce to `/login` on the first hit because the guest cookie is set on the response, not the request. Enter via `/` (redirect sets the cookie) or via `/login` → "Open workspace" to land reliably.
- Known pre-existing lint issue (not from setup): `npm run lint` reports 1 error in the auto-generated `next-env.d.ts` (triple-slash reference) plus a few unused-var warnings.
