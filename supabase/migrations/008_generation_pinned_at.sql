-- Track when drafts were pinned for library ordering (oldest pin first)
alter table public.generations
  add column if not exists pinned_at timestamptz;

create index if not exists generations_user_pinned_order_idx
  on public.generations (user_id, pinned desc, pinned_at asc nulls last, created_at desc);
