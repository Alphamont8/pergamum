-- Pin drafts in library
alter table public.generations
  add column if not exists pinned boolean not null default false;

create index if not exists generations_user_pinned_created_idx
  on public.generations (user_id, pinned desc, created_at desc);
