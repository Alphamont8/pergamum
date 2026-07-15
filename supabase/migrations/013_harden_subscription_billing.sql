-- Keep billing and leaderboard data behind server-side APIs.

drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

alter view public.leaderboard_individuals set (security_invoker = true);
alter view public.leaderboard_schools set (security_invoker = true);

revoke all on public.leaderboard_individuals from anon, authenticated;
revoke all on public.leaderboard_schools from anon, authenticated;
grant select on public.leaderboard_individuals to service_role;
grant select on public.leaderboard_schools to service_role;

-- These functions are trigger/service helpers, not public RPC endpoints.
revoke all on function public.apply_cites_ledger() from public, anon, authenticated;
revoke all on function public.apply_guest_cites_ledger() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.increment_bibliographies(uuid) from public, anon, authenticated;
revoke all on function public.protect_profile_economy_fields() from public, anon, authenticated;
revoke all on function public.set_stripe_customer(uuid, text) from public, anon, authenticated;

grant execute on function public.increment_bibliographies(uuid) to service_role;
grant execute on function public.set_stripe_customer(uuid, text) to service_role;
