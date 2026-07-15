-- Optional feedback inbox for Help page submissions
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  message text not null check (char_length(message) between 10 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_id_idx on public.feedback(user_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "Users insert own feedback" on public.feedback;
create policy "Users insert own feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users read own feedback" on public.feedback;
create policy "Users read own feedback"
  on public.feedback for select
  to authenticated
  using (auth.uid() = user_id);
