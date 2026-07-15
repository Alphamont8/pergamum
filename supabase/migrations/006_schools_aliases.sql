-- Searchable aliases for schools (acronyms / alternate names) + RPC search.
alter table public.schools
  add column if not exists aliases text[] not null default '{}';

create index if not exists schools_aliases_idx
  on public.schools using gin (aliases);

create index if not exists schools_domain_idx
  on public.schools (lower(domain));

create or replace function public.search_schools(search text, lim int default 25)
returns table (id uuid, name text, country text)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select trim(search) as raw,
           lower(trim(search)) as needle
  )
  select s.id, s.name, s.country
  from public.schools s, q
  where length(q.needle) >= 2
    and (
      s.name ilike '%' || q.raw || '%'
      or coalesce(s.domain, '') ilike '%' || q.raw || '%'
      or exists (
        select 1
        from unnest(s.aliases) as a(alias)
        where a.alias ilike '%' || q.raw || '%'
      )
    )
  order by
    case
      when lower(s.name) = q.needle then 0
      when exists (select 1 from unnest(s.aliases) a(alias) where lower(a.alias) = q.needle) then 1
      when lower(s.name) like q.needle || '%' then 2
      else 3
    end,
    s.name
  limit greatest(1, least(lim, 50));
$$;

grant execute on function public.search_schools(text, int) to authenticated;

update public.schools
set aliases = array(
  select distinct unnest(aliases || array['ESSEC', 'ESSEC Business School'])
)
where lower(name) like '%ecole superieure des sciences economiques%'
   or lower(coalesce(domain, '')) like '%essec%';
