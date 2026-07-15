-- Drop Semantic Scholar from allowed citation providers
alter table public.generation_citations
  drop constraint if exists generation_citations_provider_check;
alter table public.generation_citations
  add constraint generation_citations_provider_check
  check (provider in ('openalex', 'pubmed', 'exa', 'perplexity'));
