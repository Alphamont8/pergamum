-- Pergamum initial schema
-- Run in Supabase SQL editor or via supabase db push

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  subscription_tier text not null default 'Basic',
  stripe_customer_id text unique,
  default_citation_style text default 'APA',
  default_writing_style text default 'Academic',
  preferred_model text default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Essay',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.project_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  blueprint jsonb not null default '{}',
  outline jsonb not null default '{}',
  draft jsonb not null default '{}',
  references_data jsonb not null default '{}',
  sources jsonb not null default '[]',
  citations jsonb not null default '[]',
  workflow jsonb not null default '{}',
  workspace_context jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  kind text check (kind in ('clarification', 'action')),
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  stripe_subscription_id text unique,
  plan text not null default 'Basic',
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists chat_messages_project_id_idx on public.chat_messages(project_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_state enable row level security;
alter table public.chat_messages enable row level security;
alter table public.subscriptions enable row level security;

create policy "Users manage own profile"
  on public.profiles for all using (auth.uid() = id);

create policy "Users manage own projects"
  on public.projects for all using (auth.uid() = user_id);

create policy "Users manage own project state"
  on public.project_state for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy "Users manage own chat messages"
  on public.chat_messages for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy "Users manage own subscriptions"
  on public.subscriptions for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
