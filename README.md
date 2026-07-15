# Pergamum

Elegant AI citation generation. Paste an essay, choose a referencing style, and Pergamum finds sources, verifies claims, and formats in-text citations plus a bibliography.

## Stack

- Next.js 15 (App Router) + React 19
- Supabase (Auth, Postgres, RLS)
- Vercel AI Gateway (DeepSeek V4 Flash + OpenAI text-embedding-3-small)
- OpenAlex, PubMed, Exa, and Perplexity for plan-gated source discovery
- Citation.js (CSL) for formatting
- Stripe for Pro subscriptions and Cites top-ups

## Quick start

1. Copy `.env.example` → `.env.local` and fill values.
2. Run migration [`supabase/migrations/003_citation_app.sql`](supabase/migrations/003_citation_app.sql) in the Supabase SQL editor.
3. Seed universities: `node scripts/seed-schools.mjs` (requires `SUPABASE_SERVICE_ROLE_KEY`).
4. Enable Google + Email auth in Supabase; set redirect URL to `{APP_URL}/auth/callback`.
5. Create the Pro monthly/annual recurring Prices plus three one-time Cites pack Prices, then set the `STRIPE_PRICE_PRO_*` and `STRIPE_PRICE_CITES_*` env vars. See `SETUP.md` for webhook events and Customer Portal configuration.
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
| `/cites` | Cites, Stripe packs, referrals, ads |
| `/leaderboard` | Global / School / Friends |
| `/settings` | Profile, preferences, theme |

## Cites economy

1 Cite ≈ one sentence digested + one source found.

- Packs: 100 / 200 / 400 / 1,000 (see [docs/PRICING.md](docs/PRICING.md))
- Pro: $5.99/mo or ~$4.99/mo annual — **300** new Cites monthly
- Signup grant: **100 Cites** during Demo; **50 Cites** at release (`reward_config.signup_grant_cites`)
- Referral: **50 Cites each** for new signups only (unlimited real referrals; genuineness gates apply)
- Sign-in required to use the app (history, Cites, leaderboard, settings)
