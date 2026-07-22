-- Semester Pro + pack SKU rename (keys match cite amounts).
-- Remove annual billing_interval; semester uses monthly allotment grants for 120 days.

-- Pack keys: 100 / 200 / 500 (+ semester purchase marker)
alter table public.purchases
  drop constraint if exists purchases_pack_check;

alter table public.purchases
  add constraint purchases_pack_check
  check (pack in ('100', '200', '500', 'semester'));

-- Billing interval: month | semester only
alter table public.subscriptions
  drop constraint if exists subscriptions_billing_interval_check;

update public.subscriptions
set billing_interval = 'month'
where billing_interval = 'year';

alter table public.subscriptions
  add constraint subscriptions_billing_interval_check
  check (billing_interval in ('month', 'semester'));

-- Monthly allotment refills for Semester Pro (replaces annual year path)
create or replace function private.grant_due_pro_cites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row record;
  due_at timestamptz;
  next_due timestamptz;
  reference text;
  inserted_id uuid;
  grants integer := 0;
  grant_amount integer := 200;
begin
  for subscription_row in
    select
      s.id,
      s.user_id,
      s.billing_subscription_id,
      coalesce(nullif(s.monthly_cites, 0), 200) as monthly_cites,
      s.next_cites_grant_at,
      s.current_period_end
    from public.subscriptions s
    where s.plan_tier = 'pro'
      and s.billing_interval = 'semester'
      and s.status in ('active', 'trialing')
      and s.next_cites_grant_at is not null
      and s.current_period_end is not null
      and s.next_cites_grant_at <= now()
      and s.next_cites_grant_at < s.current_period_end
    for update skip locked
  loop
    due_at := subscription_row.next_cites_grant_at;
    grant_amount := subscription_row.monthly_cites;

    while due_at <= now() and due_at < subscription_row.current_period_end loop
      reference :=
        'pro:' || subscription_row.billing_subscription_id || ':' ||
        floor(extract(epoch from due_at))::bigint::text;
      inserted_id := null;

      insert into public.cites_ledger (user_id, delta, kind, reference_id, note)
      values (
        subscription_row.user_id,
        grant_amount,
        'subscription',
        reference,
        'Pro monthly Cites'
      )
      on conflict do nothing
      returning id into inserted_id;

      if inserted_id is not null then
        grants := grants + 1;
      end if;

      due_at := due_at + interval '1 month';
    end loop;

    -- Do not schedule a grant on or after period end (at most 4 grants including month 1).
    next_due := due_at;
    if next_due >= subscription_row.current_period_end then
      next_due := null;
    end if;

    update public.subscriptions
    set next_cites_grant_at = next_due,
        monthly_cites = 200
    where id = subscription_row.id;
  end loop;

  return grants;
end;
$$;

-- Expire Semester Pro when current_period_end has passed
create or replace function private.expire_due_semester_pro()
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
    select s.id, s.user_id
    from public.subscriptions s
    where s.billing_interval = 'semester'
      and s.status in ('active', 'trialing', 'past_due')
      and s.current_period_end is not null
      and s.current_period_end <= now()
    for update of s skip locked
  )
  update public.subscriptions s
  set
    status = 'canceled',
    cancel_at_period_end = true,
    next_cites_grant_at = null,
    updated_at = now()
  from due
  where s.id = due.id;

  with due_profiles as (
    select p.id
    from public.profiles p
    where p.plan_tier = 'pro'
      and exists (
        select 1
        from public.subscriptions s
        where s.user_id = p.id
          and s.billing_interval = 'semester'
          and s.status = 'canceled'
          and s.current_period_end is not null
          and s.current_period_end <= now()
      )
      and not exists (
        select 1
        from public.subscriptions s
        where s.user_id = p.id
          and s.status in ('active', 'trialing', 'past_due')
      )
      and (
        p.pro_trial_ends_at is null
        or p.pro_trial_ends_at <= now()
      )
    for update of p skip locked
  )
  update public.profiles p
  set
    plan_tier = 'basic',
    default_suggest_corrections = false,
    pro_cites_balance = 0,
    updated_at = now()
  from due_profiles
  where p.id = due_profiles.id;

  get diagnostics expired = row_count;
  return expired;
end;
$$;

revoke all on function private.expire_due_semester_pro() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'expire-semester-pro';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'expire-semester-pro',
    '*/15 * * * *',
    'select private.expire_due_semester_pro();'
  );
end;
$$;
