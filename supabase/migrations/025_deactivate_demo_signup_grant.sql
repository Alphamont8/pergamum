-- Deactivate the demo 100-Cite signup pipeline (migration 009).
-- All new users receive the welcome grant from reward_config (50 Cites).

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
