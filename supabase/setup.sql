-- Palate: online storage setup for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- It's safe to run more than once.

-- Wines: one row per wine, owned by the signed-in user.
create table if not exists public.wines (
  id          text        not null,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb       not null,
  updated_at  bigint      not null,
  deleted     boolean     not null default false,
  primary key (user_id, id)
);

create index if not exists wines_user_updated on public.wines (user_id, updated_at);

-- Row Level Security: each person can only ever see and change their own wines.
alter table public.wines enable row level security;

drop policy if exists "own wines: read"   on public.wines;
drop policy if exists "own wines: insert" on public.wines;
drop policy if exists "own wines: update" on public.wines;
drop policy if exists "own wines: delete" on public.wines;

create policy "own wines: read"   on public.wines for select using (user_id = auth.uid());
create policy "own wines: insert" on public.wines for insert with check (user_id = auth.uid());
create policy "own wines: update" on public.wines for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own wines: delete" on public.wines for delete using (user_id = auth.uid());

-- Photos: a private bucket; files live under a folder named after the user's id.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos: read"   on storage.objects;
drop policy if exists "own photos: insert" on storage.objects;
drop policy if exists "own photos: update" on storage.objects;
drop policy if exists "own photos: delete" on storage.objects;

create policy "own photos: read" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos: insert" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos: update" on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos: delete" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
