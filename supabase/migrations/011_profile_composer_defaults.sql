-- Composer default preferences on profile (Settings → Defaults)
alter table public.profiles
  add column if not exists default_suggest_corrections boolean not null default true;

alter table public.profiles
  add column if not exists default_recency text not null default 'any';

alter table public.profiles
  add column if not exists default_source_tier text not null default 'any';

alter table public.profiles drop constraint if exists profiles_default_recency_check;
alter table public.profiles
  add constraint profiles_default_recency_check
  check (default_recency in ('any', '10y', '5y'));

alter table public.profiles drop constraint if exists profiles_default_source_tier_check;
alter table public.profiles
  add constraint profiles_default_source_tier_check
  check (default_source_tier in ('any', 'academic'));
