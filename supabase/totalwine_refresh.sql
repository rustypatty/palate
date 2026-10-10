-- Keeping imported Total Wine stock fresh without clicking: a small job queue.
-- Every list you import with the extension is remembered (tw_sources). A refresh is a job
-- (tw_jobs): one every Monday at 10am Dallas time, or one you ask for from your phone. The
-- extension checks for jobs every few minutes while Chrome is open, works through the pages
-- in a minimized window, and carries on from the page it reached if it's interrupted.
-- Only the tw-import function writes jobs' progress; the app reads them and can ask for a refresh.
-- Applied to the live project.

-- The lists you've imported, e.g. Red Wine with Pick Up only at Las Colinas.
create table if not exists public.tw_sources (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  -- The list's address without its page number, at 120 a page.
  url text not null,
  last_imported_at timestamptz not null default now(),
  -- Switched off lists aren't refreshed.
  active boolean not null default true,
  unique (store_id, url)
);

create table if not exists public.tw_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.tw_sources (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'manual')),
  -- queued → running → done; or needs_you (a Total Wine check to finish), failed, expired.
  status text not null default 'queued' check (status in ('queued', 'running', 'needs_you', 'done', 'failed', 'expired')),
  next_page int not null default 1,
  total_pages int,
  saved int not null default 0,
  in_stock int not null default 0,
  message text not null default '',
  created_at timestamptz not null default now(),
  -- Running jobs report after every page; one silent for 15 minutes is picked up again.
  heartbeat_at timestamptz,
  finished_at timestamptz,
  -- A job nobody picked up in 12 hours is dropped rather than run at an odd time.
  expires_at timestamptz not null default now() + interval '12 hours'
);
-- One open refresh per list: asking twice doesn't queue two.
create unique index if not exists tw_jobs_one_open on public.tw_jobs (source_id) where status in ('queued', 'running', 'needs_you');

alter table public.tw_sources enable row level security;
alter table public.tw_jobs enable row level security;
drop policy if exists "read" on public.tw_sources;
create policy "read" on public.tw_sources for select to authenticated using (true);
drop policy if exists "read" on public.tw_jobs;
create policy "read" on public.tw_jobs for select to authenticated using (true);

-- Queue a refresh of every list (skipping lists that already have one open).
create or replace function public.queue_tw_refresh(job_kind text)
returns int
language sql
security definer
set search_path = ''
as $$
  with added as (
    insert into public.tw_jobs (source_id, kind)
    select s.id, job_kind from public.tw_sources s
    where s.active and not exists (select 1 from public.tw_jobs j where j.source_id = s.id and j.status in ('queued', 'running', 'needs_you'))
    returning 1
  )
  select count(*)::int from added;
$$;
revoke execute on function public.queue_tw_refresh(text) from public, anon, authenticated;

-- "Refresh stock" in the app.
create or replace function public.request_tw_refresh()
returns int
language sql
security definer
set search_path = ''
as $$
  select public.queue_tw_refresh('manual');
$$;
revoke execute on function public.request_tw_refresh() from public, anon;
grant execute on function public.request_tw_refresh() to authenticated;

-- Mondays at 10am in Dallas: cron runs in UTC, so try at 15:00 and 16:00 UTC and only act at 10 local.
create extension if not exists pg_cron;
select cron.unschedule('palate-tw-refresh') where exists (select 1 from cron.job where jobname = 'palate-tw-refresh');
select cron.schedule(
  'palate-tw-refresh',
  '0 15,16 * * 1',
  $$ select public.queue_tw_refresh('weekly') where extract(hour from now() at time zone 'America/Chicago') = 10 $$
);
