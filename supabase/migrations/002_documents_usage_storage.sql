-- Pergamum migration 002: documents, usage tracking, storage bucket

-- Documents metadata (files stored in Supabase Storage bucket "documents")
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  kind text not null default 'material' check (kind in ('brief', 'rubric', 'material', 'source')),
  parsed_text text,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsing', 'parsed', 'error')),
  parse_provider text check (parse_provider in ('local', 'llamaparse')),
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists documents_project_id_idx on public.documents(project_id);
create index if not exists documents_user_id_idx on public.documents(user_id);

-- AI / source usage events for tier quota enforcement
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_id text,
  feature text not null,
  tier text not null default 'Basic',
  created_at timestamptz not null default now(),
  constraint usage_events_actor_check check (user_id is not null or guest_id is not null)
);

create index if not exists usage_events_user_id_created_idx on public.usage_events(user_id, created_at desc);
create index if not exists usage_events_guest_id_created_idx on public.usage_events(guest_id, created_at desc);
create index if not exists usage_events_feature_created_idx on public.usage_events(feature, created_at desc);

alter table public.documents enable row level security;
alter table public.usage_events enable row level security;

-- Documents: users manage documents for their own projects
create policy "Users manage own project documents"
  on public.documents for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- Usage events: users can read their own usage
create policy "Users read own usage events"
  on public.usage_events for select using (auth.uid() = user_id);

-- Storage bucket for uploaded documents (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

-- Storage RLS: path format {user_id}/{project_id}/{document_id}/{filename}
create policy "Users upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users read own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own documents"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
