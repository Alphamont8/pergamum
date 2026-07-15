-- Harden Cites economy + guest sessions + referral reward 50
-- Prevents clients from mutating cites_balance / economy fields via RLS

-- 1) Protect economy columns on profiles (clients cannot forge balances)
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
  -- Service role (API) and internal allow-flag (ledger / helper RPCs) may update economy fields
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
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_economy on public.profiles;
create trigger protect_profile_economy
  before update on public.profiles
  for each row execute function public.protect_profile_economy_fields();

-- Ledger apply must set the allow flag so the protect trigger permits the update
create or replace function public.apply_cites_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_cites_balance_update', '1', true);
  update public.profiles
  set cites_balance = cites_balance + new.delta
  where id = new.user_id;
  return new;
end;
$$;

-- Fix signup: start at 0, grant exactly once via ledger (no double-credit)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  attempts int := 0;
  grant_amount int := 50;
begin
  begin
    select (value #>> '{}')::int into grant_amount
    from public.reward_config where key = 'signup_grant_cites';
  exception when others then
    grant_amount := 50;
  end;

  loop
    code := public.generate_referral_code();
    begin
      perform set_config('app.allow_cites_balance_update', '1', true);
      insert into public.profiles (
        id,
        display_name,
        avatar_url,
        referral_code,
        cites_balance
      ) values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
        code,
        0
      );
      insert into public.cites_ledger (user_id, delta, kind, note)
      values (new.id, grant_amount, 'grant', 'Welcome grant');
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 10 then
        raise;
      end if;
    end;
  end loop;
  return new;
end;
$$;

-- Helper for service-role bibliography increments
create or replace function public.increment_bibliographies(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_cites_balance_update', '1', true);
  update public.profiles
  set bibliographies_count = bibliographies_count + 1
  where id = p_user_id;
end;
$$;

create or replace function public.set_stripe_customer(p_user_id uuid, p_customer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_cites_balance_update', '1', true);
  update public.profiles
  set stripe_customer_id = p_customer_id
  where id = p_user_id;
end;
$$;

-- Referral reward → 50
update public.reward_config
set value = '50'::jsonb, updated_at = now()
where key = 'referral_cites';

-- Guest sessions (server-managed balances for anonymous use)
create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  cites_balance integer not null default 0 check (cites_balance >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  last_seen_at timestamptz not null default now()
);

create index if not exists guest_sessions_expires_idx on public.guest_sessions(expires_at);

alter table public.guest_sessions enable row level security;
-- No client policies: only service role can read/write guest sessions

-- Allow guest ad watches (nullable user_id + guest_session_id)
alter table public.ad_watches alter column user_id drop not null;
alter table public.ad_watches add column if not exists guest_session_id uuid references public.guest_sessions(id) on delete cascade;

alter table public.ad_watches drop constraint if exists ad_watches_owner_check;
alter table public.ad_watches add constraint ad_watches_owner_check
  check (
    (user_id is not null and guest_session_id is null)
    or (user_id is null and guest_session_id is not null)
  );

create index if not exists ad_watches_guest_session_idx on public.ad_watches(guest_session_id, issued_at desc);

-- Generations may be owned by a guest session (ephemeral history not shown in UI)
alter table public.generations alter column user_id drop not null;
alter table public.generations add column if not exists guest_session_id uuid references public.guest_sessions(id) on delete cascade;

alter table public.generations drop constraint if exists generations_owner_check;
alter table public.generations add constraint generations_owner_check
  check (
    (user_id is not null and guest_session_id is null)
    or (user_id is null and guest_session_id is not null)
  );

create index if not exists generations_guest_session_idx on public.generations(guest_session_id, created_at desc);

-- Guest ledger (audit trail for guest spends/ads; not exposed to clients)
create table if not exists public.guest_cites_ledger (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  delta integer not null,
  kind text not null check (kind in ('ad', 'spend', 'grant')),
  reference_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists guest_cites_ledger_session_idx
  on public.guest_cites_ledger(guest_session_id, created_at desc);

alter table public.guest_cites_ledger enable row level security;

create or replace function public.apply_guest_cites_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_sessions
  set cites_balance = cites_balance + new.delta,
      last_seen_at = now()
  where id = new.guest_session_id
    and cites_balance + new.delta >= 0;
  if not found then
    raise exception 'Insufficient guest Cites or invalid session';
  end if;
  return new;
end;
$$;

drop trigger if exists guest_cites_ledger_apply on public.guest_cites_ledger;
create trigger guest_cites_ledger_apply
  after insert on public.guest_cites_ledger
  for each row execute function public.apply_guest_cites_ledger();
