# Pergamum setup

## 1. Supabase

1. Create a project and copy URL + anon + service role keys into `.env.local`.
2. Run SQL migrations in order:
   - Optional: ignore or drop leftovers from `001` / `002` if present.
   - Run `supabase/migrations/003_citation_app.sql` through
     `supabase/migrations/013_harden_subscription_billing.sql`.
3. Seed universities:

```bash
node scripts/seed-schools.mjs
```

4. Auth → Providers:
   - Enable **Email**
   - Enable **Google** (OAuth client ID/secret)
5. Auth → URL configuration:
   - Site URL: your app origin
   - Redirect URLs: `{origin}/auth/callback`

## 2. Vercel AI Gateway

1. Create an AI Gateway key (or deploy on Vercel and use OIDC).
2. Set `AI_GATEWAY_API_KEY`.
3. Ensure the gateway can route:
   - `deepseek/deepseek-v4-flash`
   - `openai/text-embedding-3-small`

## 3. Research APIs

### Academic + metadata (no paid keys)

- `OPENALEX_MAILTO` — contact email for OpenAlex’s polite pool (required for reliable access; no key).
- `UNPAYWALL_EMAIL` — contact email for Unpaywall DOI lookups (free; often same as `OPENALEX_MAILTO`). Crossref uses the same mailto pattern automatically.
- Crossref — no key. Metadata enrichment runs on DOI-bearing sources after verification.

### Medical Database (Pro, medical essays only)

Uses PubMed + Europe PMC (+ ClinicalTrials.gov when the claim looks trial-related).

- `NCBI_API_KEY` — **optional**. Free from [NCBI](https://www.ncbi.nlm.nih.gov/account/). Raises PubMed rate limits. Europe PMC and ClinicalTrials.gov need no key.

### Legal Database (Pro, legal essays only — US-focused)

- `COURTLISTENER_API_TOKEN` — **required** for Legal Database Search.
  1. Create a free account at [courtlistener.com](https://www.courtlistener.com/register/).
  2. Open Profile → API and copy your token.
  3. Set `COURTLISTENER_API_TOKEN` in `.env.local`.
  4. Default free quotas are modest (rate-limited). For production volume, consider a Free Law Project membership or commercial agreement.

Without this token, Pro legal essays still use OpenAlex + web; the legal database layer is skipped.

### Web discovery

- `EXA_API_KEY` — Exa `/search` (Pro fallback) and Exa `/contents` (page hydration for all plans).
- `PERPLEXITY_API_KEY` — [Perplexity Search API](https://docs.perplexity.ai/api-reference/search-post) (`POST /search`). Flat **$0.005 per request**. Primary web discovery for news/mixed claims.

## 4. Stripe

Use a restricted Stripe API key with only the Customer, Checkout Session, Customer Portal, Price,
and Subscription permissions required by these routes.

Create a **Pro** subscription Product with two recurring Prices:

| Interval | Stripe price | Env |
|----------|--------------|-----|
| Monthly | $5.99/month | `STRIPE_PRICE_PRO_MONTHLY` |
| Annual | $54.89/year ($4.99/mo × 12) | `STRIPE_PRICE_PRO_ANNUAL` |

Annual is billed as a single yearly charge at the $4.99/mo effective rate. Pro grants
300 Cites at activation and every month after that (unused monthly allotment resets; pack
top-ups never expire). Annual subscribers receive the intervening monthly grants from the
`grant-pro-monthly-cites` Supabase Cron job (migration `012`, amount aligned to 300 in
migration `020`). The first Cites pack purchase unlocks a one-time 14-day Pro **features**
trial (no 300 allotment, no auto-charge) via migration `021`.

See [docs/PRICING.md](docs/PRICING.md) for pack sizing rationale.

Also create three **one-time** Cites pack Products/Prices:

| Pack | Price | Env |
|------|-------|-----|
| 100 Cites | $2.99 | `STRIPE_PRICE_CITES_100` |
| 200 Cites | $4.99 | `STRIPE_PRICE_CITES_200` |
| 400 Cites | $7.99 | `STRIPE_PRICE_CITES_400` |
| 1,000 Cites | $16.99 | `STRIPE_PRICE_CITES_1000` |

Configure Stripe's Customer Portal to allow subscription cancellation and payment-method updates.

Webhook endpoint: `POST /api/webhooks/stripe`  
Events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

Set `STRIPE_WEBHOOK_SECRET`.

## 5. Ads (deferred)

Rewarded “watch for Cites” is **removed**. In-generation video ads for **Basic** (Pro stays ad-free) are planned for later once there is enough traffic — do not wire NitroPay yet.

When re-adding ads later:

1. Show display/video only during citation **generation** for Basic users.
2. Do **not** grant Cites for watching ads.
3. Keep Pro ad-free as a plan perk.

## 6. Local run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — signed-out users land on the product/login page. Sign in to use citation chat, Cites, history, leaderboard, and settings.

## 7. Cites security

Balances are **not** client-writable:

- `cites_balance`, `bibliographies_count`, `referral_code`, and `stripe_customer_id` are protected by a database trigger.
- Credits/debits happen only via `cites_ledger` inserts (service role / security-definer triggers).

Apply migration `004_cites_security_guest.sql` after `003` if you still need the legacy guest tables for historical data.

### Signup grants

| Stage | `signup_grant_cites` |
|-------|----------------------|
| **Demo** (current) | **100** |
| **Release** | **50** — set via `reward_config` before launch |

### Referrals

Referral reward is **50 Cites each**, awarded only at signup/onboarding (not when redeeming a friend code later). There is **no** lifetime or daily cap on how many real people someone can refer.

Genuineness gates in `lib/cites/referrals.ts` (column `ip_hash` from migration `017`):

- Verified email required on the new account
- Disposable / throwaway email domains blocked
- One referral award per referee account
- Same referrer + same hashed IP cannot earn another bonus within 48 hours (stops self-made sockpuppets; different friends on campus Wi‑Fi are fine)
