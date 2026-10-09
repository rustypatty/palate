-- Phone notifications (price drops), used by supabase/functions/push and price-check.
-- Only Palate's server functions (service role) read or write these: RLS is on with no
-- policies, so the app's own sign-in can't touch them. Already applied to the live project.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

-- Server-made keys (the Web Push signing keys, created on first use).
create table if not exists public.server_keys (
  name text primary key,
  value jsonb not null
);
alter table public.server_keys enable row level security;
