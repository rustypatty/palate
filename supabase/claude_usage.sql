-- What each Claude call used, by feature. Written by the claude relay (supabase/functions/claude) and the
-- Monday price check; read it in the SQL Editor (query at the bottom). Run once; safe to run again.
create table if not exists public.claude_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  feature text not null,
  model text,
  input_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  output_tokens int not null default 0,
  web_searches int not null default 0,
  status int
);
create index if not exists claude_usage_at on public.claude_usage (at);
-- No policies: only the server (service role) writes or reads it.
alter table public.claude_usage enable row level security;

-- Per feature, last 30 days:
--   select feature, model, count(*) calls, sum(input_tokens) input, sum(output_tokens) output, sum(web_searches) searches
--   from public.claude_usage where at > now() - interval '30 days' group by 1, 2 order by calls desc;
