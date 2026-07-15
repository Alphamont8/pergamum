-- Referral fraud signals (hashed IP) + keep historical ad_watches table inert.
alter table public.referrals
  add column if not exists ip_hash text;

create index if not exists referrals_ip_hash_created_idx
  on public.referrals (ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists referrals_referrer_awarded_day_idx
  on public.referrals (referrer_id, created_at desc)
  where cites_awarded = true;

-- Zero out rewarded-ad config (API removed; prevent accidental re-enable via old clients).
update public.reward_config
set value = '0'::jsonb, updated_at = now()
where key in ('ad_standard_cites', 'ad_bonus_cites', 'ad_daily_cap');
