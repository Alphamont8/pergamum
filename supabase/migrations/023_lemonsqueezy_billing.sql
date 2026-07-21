-- Rename Stripe columns to provider-neutral names for Lemon Squeezy billing.

-- profiles
alter table public.profiles rename column stripe_customer_id to billing_customer_id;

-- subscriptions
alter table public.subscriptions rename column stripe_subscription_id to billing_subscription_id;
alter table public.subscriptions rename column stripe_customer_id to billing_customer_id;

-- purchases
alter table public.purchases rename column stripe_session_id to checkout_id;
alter table public.purchases rename column stripe_payment_intent to billing_order_id;

-- RPC: set billing customer (replaces set_stripe_customer)
create or replace function public.set_billing_customer(p_user_id uuid, p_customer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set billing_customer_id = p_customer_id
  where id = p_user_id;
end;
$$;

revoke all on function public.set_billing_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.set_billing_customer(uuid, text) to service_role;

-- Drop legacy Stripe RPC if present
drop function if exists public.set_stripe_customer(uuid, text);

-- Protect billing_customer_id from client updates
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
    if new.billing_customer_id is distinct from old.billing_customer_id then
      raise exception 'billing_customer_id is server-managed';
    end if;
    if new.plan_tier is distinct from old.plan_tier then
      raise exception 'plan_tier is server-managed';
    end if;
  end if;
  return new;
end;
$$;

-- Annual Pro intervening monthly grants (column rename only)
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
  grant_amount integer := 300;
begin
  for subscription_row in
    select
      s.id,
      s.user_id,
      s.billing_subscription_id,
      coalesce(nullif(s.monthly_cites, 0), 300) as monthly_cites,
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
    if subscription_row.monthly_cites = 500 then
      grant_amount := 300;
    else
      grant_amount := subscription_row.monthly_cites;
    end if;

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

    update public.subscriptions
    set next_cites_grant_at = due_at,
        monthly_cites = 300
    where id = subscription_row.id;
  end loop;

  return grants;
end;
$$;
