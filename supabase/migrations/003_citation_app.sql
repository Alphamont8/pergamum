-- Pergamum citation app schema
-- Replaces the essay-workspace schema with Cites economy + generations

-- Drop old app tables (order matters for FKs)
drop table if exists public.chat_messages cascade;
drop table if exists public.project_state cascade;
drop table if exists public.projects cascade;
drop table if exists public.documents cascade;
drop table if exists public.usage_events cascade;
drop table if exists public.subscriptions cascade;

-- Drop old profiles to recreate with new shape
drop table if exists public.profiles cascade;

create extension if not exists "pgcrypto";

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  domain text,
  web_page text,
  created_at timestamptz not null default now()
);

create index schools_name_idx on public.schools using gin (to_tsvector('english', name));
create index schools_name_trgm_idx on public.schools (lower(name));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  school_id uuid references public.schools(id) on delete set null,
  default_style text not null default 'apa',
  default_in_text boolean not null default true,
  theme_preference text not null default 'system' check (theme_preference in ('system', 'light', 'dark')),
  referral_code text not null unique,
  cites_balance integer not null default 0 check (cites_balance >= 0),
  bibliographies_count integer not null default 0 check (bibliographies_count >= 0),
  onboarding_complete boolean not null default false,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_school_id_idx on public.profiles(school_id);
create index profiles_referral_code_idx on public.profiles(referral_code);

create table public.cites_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  kind text not null check (kind in ('purchase', 'referral', 'ad', 'spend', 'grant')),
  reference_id text,
  note text,
  created_at timestamptz not null default now()
);

create index cites_ledger_user_id_idx on public.cites_ledger(user_id, created_at desc);
create index cites_ledger_kind_idx on public.cites_ledger(kind);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  essay_input text not null,
  settings jsonb not null default '{}',
  status text not null default 'analyzing'
    check (status in ('analyzing', 'quoted', 'generating', 'completed', 'failed', 'cancelled')),
  sentences jsonb not null default '[]',
  progress jsonb not null default '{}',
  result jsonb,
  cites_required integer not null default 0,
  cites_spent integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index generations_user_id_idx on public.generations(user_id, created_at desc);
create index generations_status_idx on public.generations(status);

create table public.generation_citations (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  sentence_index integer not null,
  sentence_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'searching', 'matching', 'verifying', 'done', 'failed')),
  provider text check (provider in ('openalex', 'exa')),
  similarity double precision,
  authors text,
  title text,
  source_name text,
  publication_date text,
  doi text,
  url text,
  volume text,
  issue text,
  pages text,
  metadata jsonb not null default '{}',
  correction text,
  in_text text,
  bibliography text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generation_id, sentence_index)
);

create index generation_citations_generation_id_idx
  on public.generation_citations(generation_id, sentence_index);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  cites_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (referee_id)
);

create index referrals_referrer_id_idx on public.referrals(referrer_id);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('referral', 'friend_code')),
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index friendships_user_a_idx on public.friendships(user_a);
create index friendships_user_b_idx on public.friendships(user_b);

create table public.ad_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nonce text not null unique,
  reward_cites integer not null default 1,
  status text not null default 'issued'
    check (status in ('issued', 'redeemed', 'expired')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  min_seconds integer not null default 15
);

create index ad_watches_user_day_idx on public.ad_watches(user_id, issued_at desc);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_session_id text unique,
  stripe_payment_intent text,
  pack text not null check (pack in ('500', '1100', '2500')),
  cites integer not null,
  amount_cents integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index purchases_user_id_idx on public.purchases(user_id, created_at desc);

create table public.reward_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.reward_config (key, value) values
  ('ad_standard_cites', '1'::jsonb),
  ('ad_bonus_cites', '2'::jsonb),
  ('ad_daily_cap', '20'::jsonb),
  ('referral_cites', '100'::jsonb),
  ('signup_grant_cites', '50'::jsonb);

-- Helpers
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  attempts int := 0;
begin
  loop
    code := public.generate_referral_code();
    begin
      insert into public.profiles (
        id,
        display_name,
        avatar_url,
        referral_code,
        cites_balance
      ) values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        code,
        50
      );
      insert into public.cites_ledger (user_id, delta, kind, note)
      values (new.id, 50, 'grant', 'Welcome grant');
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger generations_updated_at before update on public.generations
  for each row execute function public.touch_updated_at();
create trigger generation_citations_updated_at before update on public.generation_citations
  for each row execute function public.touch_updated_at();

-- Apply ledger delta to cached balance
create or replace function public.apply_cites_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set cites_balance = cites_balance + new.delta
  where id = new.user_id;
  return new;
end;
$$;

create trigger cites_ledger_apply
  after insert on public.cites_ledger
  for each row execute function public.apply_cites_ledger();

-- Leaderboard views
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
    where l.user_id = p.id and l.kind in ('purchase', 'referral', 'ad')
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

-- RLS
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.cites_ledger enable row level security;
alter table public.generations enable row level security;
alter table public.generation_citations enable row level security;
alter table public.referrals enable row level security;
alter table public.friendships enable row level security;
alter table public.ad_watches enable row level security;
alter table public.purchases enable row level security;
alter table public.reward_config enable row level security;

create policy "Schools are readable"
  on public.schools for select
  to authenticated
  using (true);

create policy "Users read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Profiles public for leaderboards"
  on public.profiles for select
  to authenticated
  using (onboarding_complete = true);

create policy "Users read own ledger"
  on public.cites_ledger for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users manage own generations"
  on public.generations for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own generation citations"
  on public.generation_citations for all
  to authenticated
  using (
    exists (
      select 1 from public.generations g
      where g.id = generation_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.generations g
      where g.id = generation_id and g.user_id = auth.uid()
    )
  );

create policy "Users read own referrals"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referee_id);

create policy "Users read own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "Users insert friendships involving self"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "Users read own ad watches"
  on public.ad_watches for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users read own purchases"
  on public.purchases for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Reward config readable"
  on public.reward_config for select
  to authenticated
  using (true);
