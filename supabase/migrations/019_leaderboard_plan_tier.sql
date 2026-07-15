-- Expose plan tier on individual leaderboard rows (for Pro / Basic labels in the UI).

create or replace view public.leaderboard_individuals as
select
  p.id as user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.school_id,
  s.name as school_name,
  coalesce((
    select sum(abs(l.delta))
    from public.cites_ledger l
    where l.user_id = p.id and l.kind = 'spend'
  ), 0)::bigint as sentences_checked,
  p.bibliographies_count as bibliographies_generated,
  coalesce((
    select sum(l.delta)
    from public.cites_ledger l
    where l.user_id = p.id
      and l.kind in ('purchase', 'subscription', 'referral', 'ad')
  ), 0)::bigint as cites_earned,
  p.plan_tier
from public.profiles p
left join public.schools s on s.id = p.school_id
where p.onboarding_complete = true and p.username is not null;
