-- The Monday price check (supabase/functions/price-check), run on the server even when the app isn't opened.
-- Run once in the Supabase SQL Editor. Safe to run again: it replaces the schedule and keeps the secret.
--
-- Mondays at 07 past the hour, 13:00–17:00 UTC (8am–noon in Texas). Each run checks up to 4 watched bottles
-- not checked in the last 3 days, so a few runs cover them all; runs with nothing to do cost nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- A random secret, kept in the vault, that only the scheduler sends. Nobody types or sees it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'price_check_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'price_check_secret');
  end if;
end $$;

-- The function asks the database whether the secret it was sent is the right one.
create or replace function public.check_cron_secret(s text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'price_check_secret' and decrypted_secret = s);
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

select cron.unschedule('palate-price-check') where exists (select 1 from cron.job where jobname = 'palate-price-check');
select cron.schedule(
  'palate-price-check',
  '7 13-17 * * 1',
  $$
  select net.http_post(
    url := 'https://divnzezlhqksjjqmjcbl.supabase.co/functions/v1/price-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'price_check_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
