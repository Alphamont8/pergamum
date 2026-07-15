-- Pack ladder: 100 / 200 / 400 / 1000 (legacy pack keys kept for historical rows).
alter table public.purchases drop constraint if exists purchases_pack_check;

alter table public.purchases
  add constraint purchases_pack_check
  check (pack in ('100', '200', '400', '1000', '150', '500', '1100', '2500'));
