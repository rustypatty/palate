-- Sharing your Loved wines: a read-only page at <your app>/loved/ that anyone with the link can open.
-- One shared list (slug 'loved'): a snapshot of the wines, written by the app when you tap Share or
-- Update, deleted by Stop sharing. Never your notes, prices or bottle counts (see src/lib/share.ts).
-- Anyone can read it; only the project's owner (its first account) can write it.
-- Photos go in a public bucket, 'shared', in a folder named after the owner. Safe to run more than once.

-- The project's owner: its first account, the same rule as the server functions (functions/_shared/owner.ts).
create or replace function public.palate_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and auth.uid() = (select id from auth.users order by created_at limit 1);
$$;
revoke execute on function public.palate_is_owner() from public, anon;
grant execute on function public.palate_is_owner() to authenticated;

create table if not exists public.shared_lists (
  slug       text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_lists enable row level security;
drop policy if exists "shared lists: read"  on public.shared_lists;
drop policy if exists "shared lists: write" on public.shared_lists;
create policy "shared lists: read" on public.shared_lists for select to anon, authenticated using (true);
create policy "shared lists: write" on public.shared_lists for all to authenticated
  using (user_id = (select auth.uid()) and (select public.palate_is_owner()))
  with check (user_id = (select auth.uid()) and (select public.palate_is_owner()));

-- Photos: public to read (by URL), the owner's own folder to write.
insert into storage.buckets (id, name, public)
values ('shared', 'shared', true)
on conflict (id) do update set public = true;

drop policy if exists "shared photos: insert" on storage.objects;
drop policy if exists "shared photos: update" on storage.objects;
drop policy if exists "shared photos: delete" on storage.objects;
drop policy if exists "shared photos: list"   on storage.objects;
create policy "shared photos: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shared' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.palate_is_owner()));
create policy "shared photos: update" on storage.objects for update to authenticated
  using (bucket_id = 'shared' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.palate_is_owner()));
create policy "shared photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shared' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.palate_is_owner()));
-- Listing the folder (to tidy up old photos) is the owner's only; reading a photo by URL needs no policy.
create policy "shared photos: list" on storage.objects for select to authenticated
  using (bucket_id = 'shared' and (storage.foldername(name))[1] = (select auth.uid())::text);
