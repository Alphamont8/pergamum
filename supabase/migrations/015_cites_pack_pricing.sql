-- Update one-time pack keys after pricing refresh (150 / 400 / 1000).
alter table public.purchases drop constraint if exists purchases_pack_check;

alter table public.purchases
  add constraint purchases_pack_check
  check (pack in ('150', '400', '1000', '500', '1100', '2500'));

-- Legacy pack values kept in check so historical purchase rows remain valid.
