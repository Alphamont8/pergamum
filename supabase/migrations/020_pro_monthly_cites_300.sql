-- Align Pro monthly Cites with the app constant (PRO_MONTHLY_CITES = 300).
-- Migration 012 defaulted monthly_cites to 500; the webhook grants 300.

alter table public.subscriptions
  alter column monthly_cites set default 300;

update public.subscriptions
set monthly_cites = 300
where monthly_cites = 500;

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
      s.stripe_subscription_id,
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
    -- Canonical Pro allotment is 300; coerce legacy 500 rows.
    if subscription_row.monthly_cites = 500 then
      grant_amount := 300;
    else
      grant_amount := subscription_row.monthly_cites;
    end if;

    while due_at <= now() and due_at < subscription_row.current_period_end loop
      reference :=
        'pro:' || subscription_row.stripe_subscription_id || ':' ||
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
