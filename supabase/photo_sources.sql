-- More places for the photo finder to look before the web search, searched together with the
-- catalog: Total Wine's own product photos (for the bottles your imported stock lists), and
-- photos the finder confirmed earlier on the web ("learned"), so a wine found once is found at
-- once next time. Applied to the live project.

-- Photos the web search (or Claude's pick) confirmed for a wine.
create table if not exists public.learned_photos (
  id bigserial primary key,
  user_id uuid not null default auth.uid(),
  producer text not null default '',
  name text not null,
  style text,
  image_url text not null,
  page_url text not null default '',
  site text not null default '',
  created_at timestamptz not null default now(),
  unique (producer, name, image_url)
);
alter table public.learned_photos enable row level security;
drop policy if exists "read" on public.learned_photos;
create policy "read" on public.learned_photos for select to authenticated using (true);
drop policy if exists "add own" on public.learned_photos;
create policy "add own" on public.learned_photos for insert to authenticated with check (user_id = auth.uid());

create index if not exists learned_photos_trgm on public.learned_photos using gin ((producer || ' ' || name) extensions.gin_trgm_ops);
create index if not exists tw_products_name_trgm on public.tw_products using gin (name extensions.gin_trgm_ops);

-- Same columns as catalog_search, so the app's matcher handles both alike.
create or replace function public.photo_sources_search(q text, lim integer default 15)
returns table (wine_id text, producer text, cuvee text, display_name text, aliases text[], country text, region text,
  appellation text, wine_type text, grapes text[], identity_tier text, source_count integer, min_usd_750 numeric,
  min_usd_750_seen_at timestamptz, image_url text, image_width integer, image_height integer,
  image_source_page_url text, image_source_domain text, similarity real)
language sql stable security invoker
set search_path to 'public', 'extensions'
as $$
  (select 'learned:' || l.id, l.producer, l.name, trim(l.producer || ' ' || l.name), array[lower(trim(l.producer || ' ' || l.name))],
     null::text, null::text, null::text, l.style, null::text[], 'learned', 1, null::numeric, null::timestamptz,
     l.image_url, null::int, null::int, l.page_url, l.site, similarity(l.producer || ' ' || l.name, q)
   from public.learned_photos l
   where (l.producer || ' ' || l.name) % q
   order by 20 desc limit greatest(coalesce(lim, 15), 1))
  union all
  (select 'tw:' || p.product_id, p.producer, p.name, p.name, array[lower(trim(p.producer || ' ' || p.name))],
     nullif(p.origin, ''), nullif(p.region, ''), null::text, p.style, case when p.grape <> '' then array[p.grape] end, 'totalwine', 1, null::numeric, null::timestamptz,
     'https://www.totalwine.com/dynamic/x1000,sq/images/' || p.product_id || '/' || p.product_id || '-1-fr.png', 1000, 1000,
     p.url, 'totalwine.com', greatest(similarity(p.name, q), similarity(p.producer || ' ' || p.name, q))
   from public.tw_products p
   where p.name % q or (p.producer || ' ' || p.name) % q
   order by 20 desc limit greatest(coalesce(lim, 15), 1))
$$;
grant execute on function public.photo_sources_search(text, integer) to authenticated;
-- Signed-out callers get nothing: both tables are readable only when signed in.
