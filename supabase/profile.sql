-- Your imported wine profile (My palate → import), kept with your account so it survives
-- reinstalling the app and reaches every device. One row per account; only you can read it.
-- Applied to the live project.
create table if not exists public.palate_profiles (
  user_id uuid primary key default auth.uid(),
  data jsonb not null,
  -- The profile's importedAt (ms): the newer copy wins between devices.
  updated_at bigint not null
);
alter table public.palate_profiles enable row level security;
drop policy if exists "own profile" on public.palate_profiles;
create policy "own profile" on public.palate_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
