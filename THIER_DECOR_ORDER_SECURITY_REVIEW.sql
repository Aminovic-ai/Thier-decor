-- Thier Décor: lock down privileged order and coupon RPCs
-- REVIEW ONLY: do not execute on production. Apply only after the base schema
-- and the V2 loyalty/order migrations have been reviewed on a staging database.
-- IMPORTANT: never rerun THIER_DECOR_SUPABASE_SCHEMA_FIXED_V2.sql after this file;
-- that base schema re-grants public EXECUTE on td_create_order/td_consume_promo.
begin;

do $$
begin
  if to_regprocedure('public.td_create_order(jsonb)') is null then
    raise exception 'Missing public.td_create_order(jsonb); apply/review the V2 order migration first.';
  end if;
  if to_regprocedure('public.td_consume_promo(text,text,text)') is null then
    raise exception 'Missing public.td_consume_promo(text,text,text).';
  end if;
  if to_regprocedure('public.td_promo_usage_stats()') is null then
    raise exception 'Missing public.td_promo_usage_stats().';
  end if;
  if to_regprocedure('public.td_admin_update_order_status(bigint,text)') is null then
    raise exception 'Missing public.td_admin_update_order_status(bigint,text); apply/review the customer-points/status migration first.';
  end if;
end
$$;

-- These functions can create orders, consume a customer's coupon usage,
-- reveal aggregate coupon usage, or change order status/restock inventory.
-- Only the trusted server-side Worker (service_role) may execute them.
revoke all on function public.td_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.td_create_order(jsonb) to service_role;

revoke all on function public.td_consume_promo(text,text,text) from public, anon, authenticated;
grant execute on function public.td_consume_promo(text,text,text) to service_role;

revoke all on function public.td_promo_usage_stats() from public, anon, authenticated;
grant execute on function public.td_promo_usage_stats() to service_role;

revoke all on function public.td_admin_update_order_status(bigint,text) from public, anon, authenticated;
grant execute on function public.td_admin_update_order_status(bigint,text) to service_role;

-- Coupon validation remains available to the storefront. It is read-only and
-- returns only validity/discount information; do not revoke this public path
-- unless the storefront is migrated to a server-side validation endpoint.
revoke all on function public.td_check_promo(text,text) from public;
grant execute on function public.td_check_promo(text,text) to anon, authenticated;

-- Fail closed if any privileged RPC is still executable by public client roles.
do $$
declare fn regprocedure;
begin
  foreach fn in array array[
    'public.td_create_order(jsonb)'::regprocedure,
    'public.td_consume_promo(text,text,text)'::regprocedure,
    'public.td_promo_usage_stats()'::regprocedure,
    'public.td_admin_update_order_status(bigint,text)'::regprocedure
  ] loop
    if has_function_privilege('anon', fn, 'EXECUTE')
       or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'Security verification failed: anon/authenticated can still execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'Security verification failed: service_role cannot execute %', fn;
    end if;
  end loop;

  if not has_function_privilege('anon', 'public.td_check_promo(text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.td_check_promo(text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'Coupon validation must remain executable by anon/authenticated for the current storefront flow.';
  end if;
end
$$;

commit;
