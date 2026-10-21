# Notes for Claude

## Supabase: explicit GRANTs required for new `public` tables (from 2026-10-30)

Supabase stops auto-granting Data API access to new tables in `public` on
October 30 (2026). Existing tables are unaffected and keep their grants.

Any table created in `public` on/after that date needs an explicit GRANT before
supabase-js, PostgREST, or GraphQL can reach it; otherwise the API returns
"permission denied" (the error includes the statement to run). This also
applies to migrations that recreate the schema: new projects, preview branches,
and local `supabase db reset`.

When writing a SQL file/migration that creates a table, add grants in the same
file:

```sql
grant select on public.your_table to anon;
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;
```

Tailor the grants to the table (e.g. omit `anon` for private data) and keep RLS
policies in place. Check which tables are exposed in the project's Data API
settings.
