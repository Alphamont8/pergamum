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
5. Create Lemon Squeezy products/variants for Pro monthly, Semester Pro, and Cites packs, then set the `LEMONSQUEEZY_*` env vars. See `SETUP.md` for webhook events and customer portal notes.
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

- Packs: 100 / 200 / 500 Cites at $4.99 / $7.99 / $16.99 (SKU keys match amounts; see [docs/PRICING.md](docs/PRICING.md))
- Pro Monthly: $6.99/mo — **200** new Cites monthly
- Pro Semester: $19.99 once — **200** Cites/mo for 4 months (120 days, no auto-renew)
- Signup grant: **50 Cites** (`reward_config.signup_grant_cites`)
- Referral: **25 Cites each** on the referee's first friend code, after they spend Cites on a citation run (signup or later redeem; unlimited real referrals; genuineness gates apply)
- Sign-in required to use the app (history, Cites, leaderboard, settings)
