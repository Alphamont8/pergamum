# Pricing

Last updated: July 2026.

## Pro subscription

| Interval | Price | Cites / month | Effective $/Cite (if fully used) |
|----------|-------|---------------|-------------------------------------|
| Monthly | **$5.99** | **300** | ~$0.020 |
| Annual | **$54.89/year** (~$4.99/mo × 12) | **300** | ~$0.017/mo equivalent |

Pro includes Suggestions, deeper verification, faster generation, the full referencing-style
catalog, unlimited draft length, recency filters, sentence retry, Word/PDF/BibTeX/RIS export,
Medical Database Search, Legal Database Search (US), and Real-Time Web Search Fallback.

**Basic** keeps APA / MLA / Harvard, drafts up to **1,000 words**, and any-year source search.

**300 Cites ≈ 10–12 standard essays** (typical essay uses ~15–25 flagged sentences).

The monthly Pro allotment **resets each month** (unused allotment does not roll over). Pack,
referral, and signup Cites are **permanent** and work with Pro features whenever Pro is active.

### Pack-purchase Pro features trial

Eligible Basic accounts (never had Pro / never used the trial) get a **one-time 14-day Pro
features trial** on their first completed Cites pack purchase. The trial unlocks Pro features
only — **not** the 300 monthly allotment — and **does not auto-convert or charge** when it ends.

## One-time Cites packs (Basic top-ups)

| Pack | Price | $/Cite | Typical use |
|------|-------|--------|-------------|
| **100** | $2.99 | ~$0.030 | One assignment · ~4–6 essays |
| **200** | $4.99 | ~$0.025 | Two papers · ~8–12 essays |
| **400** | $7.99 | ~$0.020 | Busy month · ~16–20 essays |
| **1,000** | $16.99 | ~$0.017 | Semester bulk · ~40+ essays |

### Why these sizes?

- **100** — Lowest paid entry; covers one meaty assignment when referrals are not enough.
- **200** — Short buffer without subscribing; still ~25% more per Cite than Pro monthly.
- **400** — Slightly more than Pro’s monthly 300; same $/Cite as Pro but **no Pro features**.
- **1,000** — Volume tier; per-Cite rate approaches annual Pro without recurring capabilities.

Packs are intentionally **worse value than Pro** at the small tiers so subscription stays the default for active writers.

## Free Cites

| Mechanism | Demo | Release |
|-----------|------|---------|
| Signup grant | **100** | **50** (`reward_config.signup_grant_cites`) |
| Referral (each side) | **50** | **50** — unlimited real referrals |

### Referral genuineness gates

No lifetime or daily cap on how many people one referrer can bring in. Soft gates in `lib/cites/referrals.ts`:

- Verified email required on the new account
- Disposable email domains blocked
- One referral award per referee (DB unique)
- Same referrer + same hashed IP: 48-hour reuse window (self-farming), not a global IP ban

Friend-code redeem after signup still adds friendship only — no Cites.

## Ads

Rewarded ads for Cites are **removed**. Future Basic-only generation video ads are deferred until traffic justifies them; Pro remains ad-free.

## Lemon Squeezy setup

Create products/variants in Lemon Squeezy and update `.env.local`:

```
LEMONSQUEEZY_VARIANT_PRO_MONTHLY=...   # $5.99/mo recurring
LEMONSQUEEZY_VARIANT_PRO_ANNUAL=...    # $54.89/yr recurring
LEMONSQUEEZY_VARIANT_CITES_100=...     # $2.99 one-time
LEMONSQUEEZY_VARIANT_CITES_200=...     # $4.99 one-time
LEMONSQUEEZY_VARIANT_CITES_400=...     # $7.99 one-time
LEMONSQUEEZY_VARIANT_CITES_1000=...    # $16.99 one-time
```

Also set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`.
