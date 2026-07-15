-- Existing Pro / past subscribers should not receive a pack-purchase features trial.
update public.profiles p
set
  pro_trial_started_at = coalesce(p.pro_trial_started_at, now()),
  updated_at = now()
where p.pro_trial_started_at is null
  and (
    p.plan_tier = 'pro'
    or exists (
      select 1
      from public.subscriptions s
      where s.user_id = p.id
    )
  );
