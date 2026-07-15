-- Persistent cache for per-sentence claim query extraction (avoids repeat LLM calls).
create table if not exists public.claim_query_cache (
  sentence_hash text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists claim_query_cache_updated_at_idx
  on public.claim_query_cache (updated_at desc);

alter table public.claim_query_cache enable row level security;

-- Service role only; no direct client access.
create policy "Service role full access on claim_query_cache"
  on public.claim_query_cache
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
