-- Palate: written wine descriptions in the shared wine catalog.
-- What a wine is, how it tastes and how to serve it. Never anything about a person:
-- "For you" is written on the person's own device.
-- Anyone using the app can read these; only the database owner can write them.
-- Safe to run more than once.

create table if not exists public.catalog_wine_notes (
  name_key      text        not null,              -- noteKey() in src/lib/catalogNotes.ts
  vintage       integer,                           -- null: any vintage
  wine_id       text,                              -- catalog_wines.wine_id, when the wine is in the catalog
  display_name  text        not null,
  what_it_is    text        not null default '',
  taste         text        not null,
  serve         text        not null default '',
  caveat        text        not null default '',
  source        text        not null default 'palate',
  updated_at    timestamptz not null default now()
);

create unique index if not exists catalog_wine_notes_key on public.catalog_wine_notes (name_key, (coalesce(vintage, 0)));
create index if not exists catalog_wine_notes_wine on public.catalog_wine_notes (wine_id);

alter table public.catalog_wine_notes enable row level security;
drop policy if exists "catalog notes: read" on public.catalog_wine_notes;
create policy "catalog notes: read" on public.catalog_wine_notes for select to anon, authenticated using (true);
grant select on public.catalog_wine_notes to anon, authenticated;
revoke insert, update, delete, truncate on public.catalog_wine_notes from anon, authenticated;

notify pgrst, 'reload schema';
