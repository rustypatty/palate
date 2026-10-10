-- Total Wine stock, imported from your own browser with the Palate Chrome extension
-- (extension/). Each import saves the bottles on the Total Wine page you're looking at,
-- with what that page says about your store: in stock or not, how many, the aisle, prices.
-- Only the tw-import function writes here; signed-in accounts can read.
-- Applied to the live project.

-- The bottles, as Total Wine lists them.
create table if not exists public.tw_products (
  product_id text primary key,
  name text not null,
  producer text not null default '',
  vintage text not null default '',
  size_ml int,
  size_text text not null default '',
  style text,
  region text not null default '',
  grape text not null default '',
  origin text not null default '',
  url text not null default '',
  pro_rating int,
  rating_source text not null default '',
  customer_rating real,
  reviews_count int,
  updated_at timestamptz not null default now()
);

-- What a store had of each bottle when it was last imported.
create table if not exists public.tw_stock (
  product_id text not null references public.tw_products (product_id) on delete cascade,
  store_id text not null,
  status text not null,
  stock_message text not null default '',
  on_hand int,
  purchase_limit int,
  aisle text not null default '',
  price real,
  sale_price real,
  deal text not null default '',
  checked_at timestamptz not null default now(),
  primary key (store_id, product_id)
);

-- The stores imported from, e.g. 535 = Las Colinas (Irving).
create table if not exists public.tw_stores (
  store_id text primary key,
  name text not null,
  city text not null default '',
  imported_at timestamptz not null default now()
);

-- The extension's connect keys. Only a SHA-256 hash is kept; the key itself is shown once.
create table if not exists public.import_keys (
  key_hash text primary key,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.tw_products enable row level security;
alter table public.tw_stock enable row level security;
alter table public.tw_stores enable row level security;
alter table public.import_keys enable row level security;

drop policy if exists "read" on public.tw_products;
create policy "read" on public.tw_products for select to authenticated using (true);
drop policy if exists "read" on public.tw_stock;
create policy "read" on public.tw_stock for select to authenticated using (true);
drop policy if exists "read" on public.tw_stores;
create policy "read" on public.tw_stores for select to authenticated using (true);
drop policy if exists "own keys" on public.import_keys;
create policy "own keys" on public.import_keys
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
