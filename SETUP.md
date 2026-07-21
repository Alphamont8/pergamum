# Pergamum setup

## 1. Supabase

1. Create a project and copy URL + anon + service role keys into `.env.local`.
2. Run SQL migrations in order:
   - Optional: ignore or drop leftovers from `001` / `002` if present.
   - Run `supabase/migrations/003_citation_app.sql` through
     `supabase/migrations/023_lemonsqueezy_billing.sql`.
3. Seed universities:

```bash
node scripts/seed-schools.mjs
```

4. Auth → Providers:
   - Enable **Email**
   - Enable **Google** (OAuth client ID/secret from Google Cloud)
5. Auth → URL configuration:
   - Site URL: your app origin (e.g. `https://pergamum.app`)
   - Redirect URLs: `{origin}/auth/callback`

### Google sign-in branding

Google shows two things during OAuth:

1. **App name + logo** — from [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**:
   - **App name:** `Pergamum`
   - **App logo:** upload `public/brand/pergamum-logo.png` (square, ≥128×128)
   - **User support email** and **Developer contact**
   - **Authorized domains:** your production domain (e.g. `pergamum.app`) and `supabase.co`
2. **“Continue to …”** — this domain is wherever Google redirects after sign-in. With Supabase Auth it is usually `your-project.supabase.co` unless you add a **Supabase custom auth domain** (e.g. `auth.pergamum.app` in Supabase → Project Settings → Custom Domains).

Use your **own** Google OAuth client (not Supabase’s shared client) in Supabase → Auth → Providers → Google so the consent screen uses your branding.

If login only works on the **second** attempt, confirm `{origin}/auth/callback` is in Supabase redirect URLs and that the callback route attaches session cookies to the redirect response (see `app/auth/callback/route.ts`).

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
- `LLAMA_CLOUD_API_KEY` (optional) — [LlamaCloud](https://cloud.llamaindex.ai) PDF fallback when Exa `/contents` leaves authors/dates thin on `.pdf` URLs. Uses LlamaParse (`source_url`) + LlamaExtract (bibliographic schema) at the **cost_effective** tier. Without this key, PDF hydration stays Exa-only.
- `LLAMA_CLOUD_PROJECT_ID` (optional) — pin Llama jobs to a specific project; otherwise the job’s default project from the API key is used.

## 4. Lemon Squeezy

Lemon Squeezy is the Merchant of Record (hosted checkout, tax remittance, customer portal).

1. Create a store at [app.lemonsqueezy.com](https://app.lemonsqueezy.com) (test mode first).
2. Create products/variants matching the prices below; copy each **variant ID** into env.
3. Create an API key and note your **store ID**.
4. Add a webhook → `POST /api/webhooks/lemon-squeezy` with the signing secret.

| Product | Price | Env |
|---------|-------|-----|
| Pro Monthly (subscription) | $5.99/month | `LEMONSQUEEZY_VARIANT_PRO_MONTHLY` |
| Pro Annual (subscription) | $54.89/year ($4.99/mo × 12) | `LEMONSQUEEZY_VARIANT_PRO_ANNUAL` |
| 100 Cites (one-time) | $2.99 | `LEMONSQUEEZY_VARIANT_CITES_100` |
| 200 Cites (one-time) | $4.99 | `LEMONSQUEEZY_VARIANT_CITES_200` |
| 400 Cites (one-time) | $7.99 | `LEMONSQUEEZY_VARIANT_CITES_400` |
| 1,000 Cites (one-time) | $16.99 | `LEMONSQUEEZY_VARIANT_CITES_1000` |

Also set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`.

Annual is billed as a single yearly charge at the $4.99/mo effective rate. Pro grants
300 Cites at activation and every month after that (unused monthly allotment resets; pack
top-ups never expire). Annual subscribers receive the intervening monthly grants from the
`grant-pro-monthly-cites` Supabase Cron job (migration `012`, amount aligned to 300 in
migration `020`). The first Cites pack purchase unlocks a one-time 14-day Pro **features**
trial (no 300 allotment, no auto-charge) via migration `021`.

See [docs/PRICING.md](docs/PRICING.md) for pack sizing rationale.

Webhook events:

- `order_created`, `order_refunded`
- `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`
- `subscription_payment_success`, `subscription_payment_failed`, `subscription_payment_recovered`

Customer portal URLs come from the Lemon Squeezy API (signed `customer_portal` on the subscription).

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

- `cites_balance`, `bibliographies_count`, `referral_code`, and `billing_customer_id` are protected by a database trigger.
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
