-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists public.kv (
  key text primary key,
  value jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists kv_key_prefix on public.kv (key text_pattern_ops);
-- The browser never talks to Supabase. Only the server uses the service-role key.
-- RLS is enabled with NO policies, so the public anon key can read or write nothing.
alter table public.kv enable row level security;
