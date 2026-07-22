# Pricing

Last updated: July 2026.

## Pro subscription

| Interval | Price | Cites / month | Effective $/Cite (if fully used) |
|----------|-------|---------------|-------------------------------------|
| Monthly | **$5.99** | **200** | ~$0.030 |
| Annual | **$54.89/year** (~$4.99/mo × 12) | **200** | ~$0.025/mo equivalent |

Pro includes Suggestions, deeper verification, faster generation, the full referencing-style
catalog, unlimited draft length, recency filters, sentence retry, Word/PDF/BibTeX/RIS export,
Medical Database Search, Legal Database Search (US), and Real-Time Web Search Fallback.

**Basic** keeps APA / MLA / Harvard, drafts up to **1,000 words**, and any-year source search.

**200 Cites ≈ 8–10 standard essays** (typical essay uses ~15–25 flagged sentences).

The monthly Pro allotment **resets each month** (unused allotment does not roll over). Pack,
referral, and signup Cites are **permanent** and work with Pro features whenever Pro is active.

### Pack-purchase Pro features trial

Eligible Basic accounts (never had Pro / never used the trial) get a **one-time 14-day Pro
features trial** on their first completed Cites pack purchase. The trial unlocks Pro features
only — **not** the 200 monthly allotment — and **does not auto-convert or charge** when it ends.

## One-time Cites packs (Basic top-ups)

Pack SKU keys (`100` / `200` / `400` / `1000`) stay stable for Lemon Squeezy and purchase history.
Cite amounts are half those keys so prices stay fee-friendly on Lemon Squeezy.

| Pack (SKU) | Cites | Price | $/Cite | Typical use |
|------------|-------|-------|--------|-------------|
| **100** | **50** | $2.99 | ~$0.060 | One short assignment · ~2–3 essays |
| **200** | **100** | $4.99 | ~$0.050 | One meaty paper · ~4–6 essays |
| **400** | **200** | $7.99 | ~$0.040 | Busy month · ~8–10 essays |
| **1000** | **500** | $16.99 | ~$0.034 | Semester bulk · ~20+ essays |

### Why these sizes?

- **50** — Lowest paid entry when free Cites run out; covers one short draft.
- **100** — Short buffer without subscribing; still ~67% more per Cite than Pro monthly.
- **200** — Same Cite count as Pro’s monthly allotment; worse $/Cite and **no Pro features**.
- **500** — Volume tier; still above Pro monthly $/Cite without recurring capabilities.

Packs are intentionally **worse value than Pro** so subscription stays the default for active writers.
Prices stay at prior levels so Lemon Squeezy’s flat fee does not dominate small checkouts.

## Free Cites

| Mechanism | Amount |
|-----------|--------|
| Signup grant | **50** (`reward_config.signup_grant_cites`) |
| Referral (each side) | **25** — unlimited real referrals |
| Demo tester code (`TRYPGM`) | **+250** Cites + **30-day Pro trial** (features + 200 monthly allotment) |

### Referral genuineness gates

No lifetime or daily cap on how many people one referrer can bring in. Soft gates in `lib/cites/referrals.ts`:

- Verified email required on the new account
- Disposable email domains blocked
- One referral award per referee (DB unique) — only their **first** friend code
- Reward is **pending** until the referee spends Cites on a citation run
- Same referrer + same hashed IP: 48-hour reuse window (self-farming), not a global IP ban

Friend codes can be entered at signup or later in Cites / Leaderboard. Additional friend codes after the first still create friendships, without a second bonus.

## Ads

Rewarded ads for Cites are **removed**. Future Basic-only generation video ads are deferred until traffic justifies them; Pro remains ad-free.

## Lemon Squeezy setup

Create products/variants in Lemon Squeezy and update `.env.local`.
**Rename product titles** to match Cite amounts (50 / 100 / 200 / 500); variant IDs and env keys stay the same.

```
LEMONSQUEEZY_VARIANT_PRO_MONTHLY=...   # $5.99/mo recurring · 200 Cites/month
LEMONSQUEEZY_VARIANT_PRO_ANNUAL=...    # $54.89/yr recurring · 200 Cites/month
LEMONSQUEEZY_VARIANT_CITES_100=...     # $2.99 one-time · 50 Cites
LEMONSQUEEZY_VARIANT_CITES_200=...     # $4.99 one-time · 100 Cites
LEMONSQUEEZY_VARIANT_CITES_400=...     # $7.99 one-time · 200 Cites
LEMONSQUEEZY_VARIANT_CITES_1000=...    # $16.99 one-time · 500 Cites
```

Also set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`.
