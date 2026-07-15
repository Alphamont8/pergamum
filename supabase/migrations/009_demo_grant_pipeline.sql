-- Demo version: 100 Cites starting grant + multi-provider citation pipeline

-- 1) Signup grant → 100 Cites
update public.reward_config
set value = '100'::jsonb, updated_at = now()
where key = 'signup_grant_cites';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  attempts int := 0;
  grant_amount int := 100;
begin
  begin
    select (value #>> '{}')::int into grant_amount
    from public.reward_config where key = 'signup_grant_cites';
  exception when others then
    grant_amount := 100;
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

-- 2) One-time top-up: bring every existing user's welcome grant total to 100
-- (idempotent: re-running grants nothing once totals reach 100)
insert into public.cites_ledger (user_id, delta, kind, note)
select p.id, 100 - coalesce(w.total, 0), 'grant', 'Demo starting grant top-up'
from public.profiles p
left join (
  select user_id, sum(delta) as total
  from public.cites_ledger
  where kind = 'grant'
    and note in ('Welcome grant', 'Demo starting grant top-up')
  group by user_id
) w on w.user_id = p.id
where 100 - coalesce(w.total, 0) > 0;

-- 3) Allow new citation search providers
alter table public.generation_citations
  drop constraint if exists generation_citations_provider_check;
alter table public.generation_citations
  add constraint generation_citations_provider_check
  check (provider in ('openalex', 'pubmed', 'exa', 'perplexity'));
