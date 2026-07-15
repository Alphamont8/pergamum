-- Basic / Plus / Pro subscription model.
-- Plus is reserved for a later release; Pro is the only paid tier currently sold.

alter table public.profiles
  add column if not exists plan_tier text not null default 'basic';

alter table public.profiles drop constraint if exists profiles_plan_tier_check;
alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('basic', 'plus', 'pro'));

alter table public.profiles
  alter column default_suggest_corrections set default false;

update public.profiles
set default_suggest_corrections = false
where plan_tier = 'basic';

alter table public.cites_ledger drop constraint if exists cites_ledger_kind_check;
alter table public.cites_ledger
  add constraint cites_ledger_kind_check
  check (kind in ('purchase', 'subscription', 'referral', 'ad', 'spend', 'grant'));

create unique index if not exists cites_ledger_billing_reference_uidx
  on public.cites_ledger(kind, reference_id)
  where kind in ('purchase', 'subscription') and reference_id is not null;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  plan_tier text not null check (plan_tier in ('plus', 'pro')),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  status text not null check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  monthly_cites integer not null default 500 check (monthly_cites > 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  next_cites_grant_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_grant_idx
  on public.subscriptions(status, next_cites_grant_at)
  where plan_tier = 'pro';

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;

-- Keep plan tier server-managed alongside the existing economy fields.
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

-- Scheduled grants keep annual subscribers on the same 500-Cites monthly cadence.
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.grant_due_pro_cites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row record;
  due_at timestamptz;
  reference text;
  inserted_id uuid;
  grants integer := 0;
begin
  for subscription_row in
    select
      s.id,
      s.user_id,
      s.stripe_subscription_id,
      s.monthly_cites,
      s.next_cites_grant_at,
      s.current_period_end
    from public.subscriptions s
    where s.plan_tier = 'pro'
      and s.billing_interval = 'year'
      and s.status in ('active', 'trialing')
      and s.next_cites_grant_at is not null
      and s.current_period_end is not null
      and s.next_cites_grant_at <= now()
      and s.next_cites_grant_at < s.current_period_end
    for update skip locked
  loop
    due_at := subscription_row.next_cites_grant_at;

    while due_at <= now() and due_at < subscription_row.current_period_end loop
      reference :=
        'pro:' || subscription_row.stripe_subscription_id || ':' ||
        floor(extract(epoch from due_at))::bigint::text;
      inserted_id := null;

      insert into public.cites_ledger (user_id, delta, kind, reference_id, note)
      values (
        subscription_row.user_id,
        subscription_row.monthly_cites,
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

    update public.subscriptions
    set next_cites_grant_at = due_at
    where id = subscription_row.id;
  end loop;

  return grants;
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'grant-pro-monthly-cites'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'grant-pro-monthly-cites',
    '17 0 * * *',
    'select private.grant_due_pro_cites();'
  );
end;
$$;

-- Subscription Cites count as Cites gained on leaderboards.
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
  ), 0)::bigint as cites_earned
from public.profiles p
left join public.schools s on s.id = p.school_id
where p.onboarding_complete = true and p.username is not null;

create or replace view public.leaderboard_schools as
select
  s.id as school_id,
  s.name as school_name,
  s.country,
  coalesce(sum(li.sentences_checked), 0)::bigint as sentences_checked,
  coalesce(sum(li.bibliographies_generated), 0)::bigint as bibliographies_generated,
  coalesce(sum(li.cites_earned), 0)::bigint as cites_earned,
  count(li.user_id)::bigint as member_count
from public.schools s
left join public.leaderboard_individuals li on li.school_id = s.id
group by s.id, s.name, s.country;
