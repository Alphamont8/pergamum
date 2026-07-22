# Pergamum

Elegant AI citation generation. Paste an essay, choose a referencing style, and Pergamum finds sources, verifies claims, and formats in-text citations plus a bibliography.

## Stack

- Next.js 15 (App Router) + React 19
- Supabase (Auth, Postgres, RLS)
- Vercel AI Gateway (DeepSeek V4 Flash + OpenAI text-embedding-3-small)
- OpenAlex, PubMed, Exa, and Perplexity for plan-gated source discovery
- Citation.js (CSL) for formatting
- Lemon Squeezy for Pro subscriptions and Cites top-ups (Merchant of Record)

## Quick start

1. Copy `.env.example` → `.env.local` and fill values.
2. Run migration [`supabase/migrations/003_citation_app.sql`](supabase/migrations/003_citation_app.sql) in the Supabase SQL editor.
3. Seed universities: `node scripts/seed-schools.mjs` (requires `SUPABASE_SERVICE_ROLE_KEY`).
4. Enable Google + Email auth in Supabase; set redirect URL to `{APP_URL}/auth/callback`.
5. Create Lemon Squeezy products/variants for Pro monthly/annual and Cites packs, then set the `LEMONSQUEEZY_*` env vars. See `SETUP.md` for webhook events and customer portal notes.
6. `npm install && npm run dev`

See [SETUP.md](SETUP.md) for full production setup.

## Routes

| Path | Purpose |
|------|---------|
| `/login` | Google + email/password |
| `/onboarding` | Username + optional university |
| `/` | Citation chat |
| `/c/[id]` | Past generation |
| `/upgrade` | Basic / Pro comparison and subscription management |
| `/cites` | Cites, packs, referrals, ads |
| `/leaderboard` | Global / School / Friends |
| `/settings` | Profile, preferences, theme |

## Cites economy

1 Cite ≈ one sentence digested + one source found.

- Packs: 50 / 100 / 200 / 500 Cites at $2.99 / $4.99 / $7.99 / $16.99 (SKU keys `100`/`200`/`400`/`1000`; see [docs/PRICING.md](docs/PRICING.md))
- Pro: $5.99/mo or ~$4.99/mo annual — **200** new Cites monthly
- Signup grant: **50 Cites** (`reward_config.signup_grant_cites`)
- Referral: **25 Cites each** on the referee's first friend code, after they spend Cites on a citation run (signup or later redeem; unlimited real referrals; genuineness gates apply)
- Sign-in required to use the app (history, Cites, leaderboard, settings)
