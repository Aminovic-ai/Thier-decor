-- Read-only audit: inspect table columns and RLS status before writing policies.
-- This script does not alter data, permissions, or tables.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('products','orders','customers','settings','messages','requests','expenses','td_promo_uses','td_visit_events')
order by table_name, ordinal_position;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('products','orders','customers','settings','messages','requests','expenses','td_promo_uses','td_visit_events')
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('products','orders','customers','settings','messages','requests','expenses','td_promo_uses','td_visit_events')
order by tablename, policyname;
