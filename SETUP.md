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

| Product | Price | Cites | Env |
|---------|-------|-------|-----|
| Pro Monthly (subscription) | $6.99/month | 200/month | `LEMONSQUEEZY_VARIANT_PRO_MONTHLY` |
| Pro Semester (one-time) | $19.99 once | 200/month for 4 months | `LEMONSQUEEZY_VARIANT_PRO_SEMESTER` |
| 100 Cites (one-time) | $4.99 | 100 | `LEMONSQUEEZY_VARIANT_CITES_100` |
| 200 Cites (one-time) | $7.99 | 200 | `LEMONSQUEEZY_VARIANT_CITES_200` |
| 500 Cites (one-time) | $16.99 | 500 | `LEMONSQUEEZY_VARIANT_CITES_500` |

Also set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`.

Rename Lemon Squeezy product titles to match Cite amounts (100 / 200 / 500). Env keys match
cite counts; the app grants Cites from `lib/cites/packs.ts`.

Monthly Pro grants 200 Cites on each paid invoice. Semester Pro is a one-time Lemon order that
activates Pro for 120 days, grants month-1 allotment at purchase, and receives months 2–4 from
the `grant-pro-monthly-cites` Supabase Cron (migration `026`). When the term ends,
`expire-semester-pro` demotes the plan and clears leftover allotment. Pack Cites remain permanent
and work with Pro features while either plan is active.

The first Cites pack purchase (any size) unlocks a one-time 7-day Pro **features** trial (no 200 allotment,
no auto-charge) via migration `021`.

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

All new accounts receive **50 Cites** via `reward_config.signup_grant_cites` (see migration `025_deactivate_demo_signup_grant.sql`).

### Demo tester code

Redeem **`TRYPGM`** (or set `DEMO_TESTER_CODE` for an alias) on Cites / Leaderboard or at onboarding:

- **+250** permanent Cites
- **30-day Pro trial** at no charge (Pro features + one **200**-Cite monthly allotment)

One redemption per account. Implementation: `lib/billing/demoTesterCode.ts`.

### Referrals

Referral reward is **25 Cites each**. The first eligible friend code (at signup or later in Cites /
Leaderboard) creates a pending referral; both sides are paid after the referee spends Cites on a
citation run. Extra friend codes only add friendship. There is **no** lifetime or daily cap on how
many real people someone can refer.

Genuineness gates in `lib/cites/referrals.ts` (column `ip_hash` from migration `017`):

- Verified email required on the new account
- Disposable / throwaway email domains blocked
- One referral award per referee account (first friend code only)
- Same referrer + same hashed IP cannot earn another bonus within 48 hours (stops self-made sockpuppets; different friends on campus Wi‑Fi are fine)
