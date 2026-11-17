-- Thier Décor: remove direct browser access to private storefront tables.
-- REVIEW ONLY: do not run until the updated Worker and Pages frontend are deployed
-- and the adminListProducts path has passed an authenticated end-to-end test.
--
-- The browser must read public catalog/settings through the public Worker routes.
-- Administrator product reads must use the Firebase-verified adminListProducts
-- Worker action (service role). Product Realtime subscriptions are intentionally
-- removed because they require direct browser table access.
--
-- This migration intentionally does not touch POS tables, stock RPCs, orders,
-- customers, or the shared inventory logic.

begin;

revoke all privileges on table public.products from anon, authenticated;
revoke all privileges on table public.settings from anon, authenticated;

-- Remove the permissive public SELECT policies as defense in depth. If a table
-- grant is accidentally restored later, anonymous/authenticated SELECT remains
-- denied until a deliberate, reviewed policy is added.
drop policy if exists "Public can read products" on public.products;
drop policy if exists "Public can read settings" on public.settings;

-- These SECURITY DEFINER routines are intended to be called by the Worker
-- using service_role, not directly by browser roles. In particular, direct
-- anon execution of td_create_order could bypass the Firebase/customer-session
-- checks in the Worker and create orders while decrementing shared stock.
revoke execute on function public.td_check_promo(text, text) from public, anon, authenticated;
revoke execute on function public.td_compute_delivery_price(integer, text, text) from public, anon, authenticated;
revoke execute on function public.td_consume_promo(text, text, text) from public, anon, authenticated;
revoke execute on function public.td_create_order(jsonb) from public, anon, authenticated;
revoke execute on function public.td_get_visit_stats() from public, anon, authenticated;
revoke execute on function public.td_promo_usage_stats() from public, anon, authenticated;
revoke execute on function public.td_record_visit(text) from public, anon, authenticated;

grant execute on function public.td_check_promo(text, text) to service_role;
grant execute on function public.td_compute_delivery_price(integer, text, text) to service_role;
grant execute on function public.td_consume_promo(text, text, text) to service_role;
grant execute on function public.td_create_order(jsonb) to service_role;
grant execute on function public.td_get_visit_stats() to service_role;
grant execute on function public.td_promo_usage_stats() to service_role;
grant execute on function public.td_record_visit(text) to service_role;

commit;

-- Verification: every browser-role table privilege must be false; service_role access must remain true.
select
  has_table_privilege('anon', 'public.products', 'SELECT') as anon_products_select,
  has_table_privilege('anon', 'public.products', 'INSERT') as anon_products_insert,
  has_table_privilege('anon', 'public.products', 'UPDATE') as anon_products_update,
  has_table_privilege('anon', 'public.products', 'DELETE') as anon_products_delete,
  has_table_privilege('authenticated', 'public.products', 'SELECT') as authenticated_products_select,
  has_table_privilege('authenticated', 'public.products', 'INSERT') as authenticated_products_insert,
  has_table_privilege('authenticated', 'public.products', 'UPDATE') as authenticated_products_update,
  has_table_privilege('authenticated', 'public.products', 'DELETE') as authenticated_products_delete,
  has_table_privilege('anon', 'public.settings', 'SELECT') as anon_settings_select,
  has_table_privilege('anon', 'public.settings', 'INSERT') as anon_settings_insert,
  has_table_privilege('anon', 'public.settings', 'UPDATE') as anon_settings_update,
  has_table_privilege('anon', 'public.settings', 'DELETE') as anon_settings_delete,
  has_table_privilege('authenticated', 'public.settings', 'SELECT') as authenticated_settings_select,
  has_table_privilege('authenticated', 'public.settings', 'INSERT') as authenticated_settings_insert,
  has_table_privilege('authenticated', 'public.settings', 'UPDATE') as authenticated_settings_update,
  has_table_privilege('authenticated', 'public.settings', 'DELETE') as authenticated_settings_delete,
  has_table_privilege('service_role', 'public.products', 'SELECT') as service_role_products_select,
  has_table_privilege('service_role', 'public.products', 'UPDATE') as service_role_products_update,
  has_table_privilege('service_role', 'public.settings', 'SELECT') as service_role_settings_select,
  has_table_privilege('service_role', 'public.settings', 'UPDATE') as service_role_settings_update;

-- Every browser role must be denied all seven SECURITY DEFINER RPCs.
-- service_role must retain EXECUTE on each one.
select
  has_function_privilege('anon', 'public.td_check_promo(text,text)', 'EXECUTE') as anon_check_promo_exec,
  has_function_privilege('authenticated', 'public.td_check_promo(text,text)', 'EXECUTE') as authenticated_check_promo_exec,
  has_function_privilege('service_role', 'public.td_check_promo(text,text)', 'EXECUTE') as service_check_promo_exec,
  has_function_privilege('anon', 'public.td_compute_delivery_price(integer,text,text)', 'EXECUTE') as anon_delivery_exec,
  has_function_privilege('authenticated', 'public.td_compute_delivery_price(integer,text,text)', 'EXECUTE') as authenticated_delivery_exec,
  has_function_privilege('service_role', 'public.td_compute_delivery_price(integer,text,text)', 'EXECUTE') as service_delivery_exec,
  has_function_privilege('anon', 'public.td_consume_promo(text,text,text)', 'EXECUTE') as anon_consume_promo_exec,
  has_function_privilege('authenticated', 'public.td_consume_promo(text,text,text)', 'EXECUTE') as authenticated_consume_promo_exec,
  has_function_privilege('service_role', 'public.td_consume_promo(text,text,text)', 'EXECUTE') as service_consume_promo_exec,
  has_function_privilege('anon', 'public.td_create_order(jsonb)', 'EXECUTE') as anon_create_order_exec,
  has_function_privilege('authenticated', 'public.td_create_order(jsonb)', 'EXECUTE') as authenticated_create_order_exec,
  has_function_privilege('service_role', 'public.td_create_order(jsonb)', 'EXECUTE') as service_create_order_exec,
  has_function_privilege('anon', 'public.td_get_visit_stats()', 'EXECUTE') as anon_visit_stats_exec,
  has_function_privilege('authenticated', 'public.td_get_visit_stats()', 'EXECUTE') as authenticated_visit_stats_exec,
  has_function_privilege('service_role', 'public.td_get_visit_stats()', 'EXECUTE') as service_visit_stats_exec,
  has_function_privilege('anon', 'public.td_promo_usage_stats()', 'EXECUTE') as anon_promo_stats_exec,
  has_function_privilege('authenticated', 'public.td_promo_usage_stats()', 'EXECUTE') as authenticated_promo_stats_exec,
  has_function_privilege('service_role', 'public.td_promo_usage_stats()', 'EXECUTE') as service_promo_stats_exec,
  has_function_privilege('anon', 'public.td_record_visit(text)', 'EXECUTE') as anon_record_visit_exec,
  has_function_privilege('authenticated', 'public.td_record_visit(text)', 'EXECUTE') as authenticated_record_visit_exec,
  has_function_privilege('service_role', 'public.td_record_visit(text)', 'EXECUTE') as service_record_visit_exec;

-- Rollback warning:
-- Do not restore table-wide SELECT to anon/authenticated. That would expose
-- products.cost and private settings columns again. If a rollback is required,
-- first revert the frontend/Worker together, then design explicit column-level
-- grants for public product/settings fields and re-test the legacy client.
-- Existing privileged routines td_find_customer_by_phone,
-- td_admin_update_order_status, td_pos_commit_stock, and td_record_visit_safe
-- were already denied to anon/authenticated and are intentionally unchanged.
