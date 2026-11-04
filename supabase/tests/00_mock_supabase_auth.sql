-- Local test only (NOT for Supabase): fakes the auth schema so schema.sql can be tested on plain Postgres.
do $$ begin create role anon nologin; exception when others then null; end $$; do $$ begin create role authenticated nologin; exception when others then null; end $$;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true),''), (nullif(current_setting('request.jwt.claims', true),'')::json->>'sub')),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
