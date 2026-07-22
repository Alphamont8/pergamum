-- Halve referral reward and Pro monthly allotment.
-- Welcome signup grant stays at 50 (reward_config.signup_grant_cites).
-- Pack Cite amounts are app-side (lib/cites/packs.ts); purchases.pack keys unchanged.

-- Referral: 50 → 25
update public.reward_config
set value = '25'::jsonb, updated_at = now()
where key = 'referral_cites';

-- Welcome stays 50 (normalize demo 100 → release 50)
update public.reward_config
set value = '50'::jsonb, updated_at = now()
where key = 'signup_grant_cites';

-- Pro monthly allotment: 300 → 200
alter table public.subscriptions
  alter column monthly_cites set default 200;

update public.subscriptions
set monthly_cites = 200
where monthly_cites in (300, 500);

-- Annual Pro intervening monthly grants
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
      and s.billing_interval = 'year'
      and s.status in ('active', 'trialing')
      and s.next_cites_grant_at is not null
      and s.current_period_end is not null
      and s.next_cites_grant_at <= now()
      and s.next_cites_grant_at < s.current_period_end
    for update skip locked
  loop
    due_at := subscription_row.next_cites_grant_at;
    -- Coerce legacy allotment values to the canonical 200.
    if subscription_row.monthly_cites in (300, 500) then
      grant_amount := 200;
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
        monthly_cites = 200
    where id = subscription_row.id;
  end loop;

  return grants;
end;
$$;
