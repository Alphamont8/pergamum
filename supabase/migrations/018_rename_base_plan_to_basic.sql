-- Rename free tier plan_tier from base to basic.

select set_config('app.allow_cites_balance_update', '1', true);

alter table public.profiles drop constraint if exists profiles_plan_tier_check;

update public.profiles
set plan_tier = 'basic'
where plan_tier = 'base';

alter table public.profiles
  alter column plan_tier set default 'basic';

alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('basic', 'plus', 'pro'));
