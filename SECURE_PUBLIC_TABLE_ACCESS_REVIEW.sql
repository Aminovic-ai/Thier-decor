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

commit;

-- Verification: expected false for anon/authenticated; service_role must remain true.
select
  has_table_privilege('anon', 'public.products', 'SELECT') as anon_products_select,
  has_table_privilege('authenticated', 'public.products', 'SELECT') as authenticated_products_select,
  has_table_privilege('anon', 'public.settings', 'SELECT') as anon_settings_select,
  has_table_privilege('authenticated', 'public.settings', 'SELECT') as authenticated_settings_select,
  has_table_privilege('service_role', 'public.products', 'SELECT') as service_role_products_select,
  has_table_privilege('service_role', 'public.settings', 'SELECT') as service_role_settings_select;

-- Emergency rollback only if reverting the frontend/Worker to the old direct-read
-- architecture. This restores broad public access, including product cost and
-- private settings columns; it is NOT recommended for normal operation.
--
-- begin;
-- grant select on table public.products to anon, authenticated;
-- grant select on table public.settings to anon, authenticated;
-- create policy "Public can read products" on public.products for select to anon, authenticated using (true);
-- create policy "Public can read settings" on public.settings for select to anon, authenticated using (true);
-- commit;
