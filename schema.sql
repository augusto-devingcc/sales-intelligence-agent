create extension if not exists pgcrypto;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  domain text unique not null,
  name text,
  industry text,
  size_estimate text,
  tech_stack text[] default array[]::text[],
  description text,
  location text,
  founded_year int,
  enriched_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  agent_steps jsonb default '[]'::jsonb,
  classification jsonb,
  generated_email text,
  error_message text,
  claude_model text default 'claude-opus-4-7',
  total_tokens int default 0,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_enrichment_runs_domain on enrichment_runs(domain);
create index if not exists idx_enrichment_runs_status on enrichment_runs(status);
create index if not exists idx_enrichment_runs_created_at on enrichment_runs(created_at desc);

alter table companies enable row level security;
alter table enrichment_runs enable row level security;

create policy "public read companies" on companies for select to anon using (true);
create policy "public read runs" on enrichment_runs for select to anon using (true);
