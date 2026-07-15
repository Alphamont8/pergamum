-- Pack-purchase Pro features trial (14 days, no Stripe subscription / no auto-charge).
-- Split Cites into permanent (packs/referrals/grants) vs monthly Pro allotment (use-it-or-lose-it).

alter table public.profiles
  add column if not exists pro_cites_balance integer not null default 0
    check (pro_cites_balance >= 0);

alter table public.profiles
  add column if not exists pro_trial_started_at timestamptz;

alter table public.profiles
  add column if not exists pro_trial_ends_at timestamptz;

comment on column public.profiles.pro_cites_balance is
  'Remaining Pro monthly Cites allotment; resets on each grant and clears when Pro access ends.';
comment on column public.profiles.pro_trial_started_at is
  'Set once when a Pro features trial starts or the trial opportunity is consumed (paid/manual Pro).';
comment on column public.profiles.pro_trial_ends_at is
  'When the timed pack-purchase Pro features trial ends. Null if no timed trial is active.';

-- Protect trial + monthly pool fields from client updates.
create or replace function public.protect_profile_economy_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  allow_flag text := coalesce(current_setting('app.allow_cites_balance_update', true), '');
begin
  if jwt_role = 'service_role' or allow_flag = '1' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.cites_balance is distinct from old.cites_balance then
      raise exception 'cites_balance is server-managed and cannot be updated directly';
    end if;
    if new.pro_cites_balance is distinct from old.pro_cites_balance then
      raise exception 'pro_cites_balance is server-managed and cannot be updated directly';
    end if;
    if new.pro_trial_started_at is distinct from old.pro_trial_started_at then
      raise exception 'pro_trial_started_at is server-managed';
    end if;
    if new.pro_trial_ends_at is distinct from old.pro_trial_ends_at then
      raise exception 'pro_trial_ends_at is server-managed';
    end if;
    if new.bibliographies_count is distinct from old.bibliographies_count then
      raise exception 'bibliographies_count is server-managed and cannot be updated directly';
    end if;
    if new.referral_code is distinct from old.referral_code then
      raise exception 'referral_code cannot be changed';
    end if;
    if new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'stripe_customer_id is server-managed';
    end if;
    if new.plan_tier is distinct from old.plan_tier then
      raise exception 'plan_tier is server-managed';
    end if;
  end if;
  return new;
end;
$$;

-- Dual-pool ledger apply:
-- - subscription credits replace the monthly Pro pool (unused allotment expires)
-- - other credits go to permanent cites_balance
-- - spends draw from monthly Pro pool first, then permanent
create or replace function public.apply_cites_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  need integer;
  from_pro integer;
  from_permanent integer;
  permanent_bal integer;
  pro_bal integer;
begin
  perform set_config('app.allow_cites_balance_update', '1', true);

  if new.kind = 'subscription' and new.delta > 0 then
    update public.profiles
    set pro_cites_balance = new.delta
    where id = new.user_id;
    return new;
  end if;

  if new.delta > 0 then
    update public.profiles
    set cites_balance = cites_balance + new.delta
    where id = new.user_id;
    return new;
  end if;

  if new.delta < 0 then
    need := abs(new.delta);

    select cites_balance, pro_cites_balance
      into permanent_bal, pro_bal
    from public.profiles
    where id = new.user_id
    for update;

    if permanent_bal is null then
      raise exception 'profile not found for cites ledger';
    end if;

    from_pro := least(pro_bal, need);
    from_permanent := need - from_pro;

    if from_permanent > permanent_bal then
      raise exception 'insufficient cites balance';
    end if;

    update public.profiles
    set
      pro_cites_balance = pro_bal - from_pro,
      cites_balance = permanent_bal - from_permanent
    where id = new.user_id;
  end if;

  return new;
end;
$$;

-- Expire timed Pro features trials that have ended (no Stripe charge; just drop features).
create or replace function private.expire_due_pro_feature_trials()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired integer := 0;
begin
  perform set_config('app.allow_cites_balance_update', '1', true);

  with due as (
    select p.id
    from public.profiles p
    where p.plan_tier = 'pro'
      and p.pro_trial_ends_at is not null
      and p.pro_trial_ends_at <= now()
      and not exists (
        select 1
        from public.subscriptions s
        where s.user_id = p.id
          and s.status in ('active', 'trialing', 'past_due')
      )
    for update of p skip locked
  )
  -- Keep pro_trial_ends_at as the historical end so the UI can urge a paid convert.
  update public.profiles p
  set
    plan_tier = 'basic',
    default_suggest_corrections = false,
    pro_cites_balance = 0,
    updated_at = now()
  from due
  where p.id = due.id;

  get diagnostics expired = row_count;
  return expired;
end;
$$;

revoke all on function private.expire_due_pro_feature_trials() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'expire-pro-feature-trials';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'expire-pro-feature-trials',
    '*/15 * * * *',
    'select private.expire_due_pro_feature_trials();'
  );
end;
$$;
