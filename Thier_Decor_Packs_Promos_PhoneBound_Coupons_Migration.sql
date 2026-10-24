-- Thier Décor Store: database migration for Packs and product promotions
-- Run this once in Supabase Dashboard > SQL Editor > New query.
-- Existing products and orders are not deleted or rewritten.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "isPack" boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "packItems" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "promoPrice" numeric(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "promoStart" date;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "promoEnd" date;

-- Verify new columns after running:
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='products'
-- and column_name in ('isPack','packItems','promoPrice','promoStart','promoEnd');
-- Thier Décor Store: phone-bound promo codes with configurable order-use limit.
-- Run this whole file in Supabase Dashboard > SQL Editor before using promo codes.
-- Existing products/orders/customers/settings tables are not recreated.

create table if not exists public.td_promo_uses (
  id bigint generated always as identity primary key,
  promo_code text not null,
  customer_phone text not null,
  order_id text not null unique,
  used_at timestamptz not null default now()
);
create index if not exists td_promo_uses_code_phone_idx
  on public.td_promo_uses (upper(promo_code), customer_phone);
-- Add optional order metadata used by the updated admin order details.
alter table public.orders add column if not exists "promoCode" text;
alter table public.orders add column if not exists "promoDiscountPercent" numeric(5,2) not null default 0;
alter table public.orders add column if not exists "promoDiscountAmount" numeric(12,2) not null default 0;
alter table public.td_promo_uses enable row level security;
revoke all on public.td_promo_uses from anon, authenticated;

create or replace function public.td_normalize_phone(p_phone text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;
revoke all on function public.td_normalize_phone(text) from public;

create or replace function public.td_check_promo(p_code text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cp jsonb;
  used_count integer;
  phone_norm text := public.td_normalize_phone(p_phone);
  code_norm text := upper(trim(coalesce(p_code, '')));
begin
  if code_norm = '' or phone_norm = '' then
    return jsonb_build_object('valid', false, 'reason', 'missing');
  end if;
  select elem into cp
  from public.settings s,
       lateral jsonb_array_elements(coalesce(s.coupons::jsonb, '[]'::jsonb)) elem
  where s.id = 1 and upper(trim(coalesce(elem->>'code',''))) = code_norm
  limit 1;
  if cp is null then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if coalesce((cp->>'active')::boolean, true) is false then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if public.td_normalize_phone(cp->>'phone') <> phone_norm then
    return jsonb_build_object('valid', false, 'reason', 'phone_mismatch');
  end if;
  if nullif(cp->>'expiresAt','') is not null and (cp->>'expiresAt')::timestamptz < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  select count(*)::integer into used_count from public.td_promo_uses
    where upper(promo_code) = code_norm and customer_phone = phone_norm;
  if used_count >= greatest(coalesce((cp->>'maxUses')::integer, 1), 1) then
    return jsonb_build_object('valid', false, 'reason', 'limit_reached', 'used', used_count,
      'maxUses', coalesce((cp->>'maxUses')::integer, 1));
  end if;
  return jsonb_build_object('valid', true, 'code', code_norm,
    'discount', greatest(0, least(100, coalesce((cp->>'discount')::numeric, 0))),
    'used', used_count, 'maxUses', greatest(coalesce((cp->>'maxUses')::integer, 1), 1),
    'remaining', greatest(coalesce((cp->>'maxUses')::integer, 1) - used_count, 0));
end; $$;

create or replace function public.td_consume_promo(p_code text, p_phone text, p_order_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare check_result jsonb; phone_norm text := public.td_normalize_phone(p_phone);
begin
  if coalesce(p_order_id,'') = '' then return jsonb_build_object('ok',false,'reason','missing_order'); end if;
  -- Serialise uses for this code/phone so simultaneous orders cannot exceed the limit.
  perform pg_advisory_xact_lock(hashtext(upper(trim(coalesce(p_code,''))) || ':' || phone_norm));
  check_result := public.td_check_promo(p_code, p_phone);
  if coalesce((check_result->>'valid')::boolean, false) is not true then
    return jsonb_build_object('ok',false,'reason',check_result->>'reason');
  end if;
  insert into public.td_promo_uses(promo_code, customer_phone, order_id)
  values (upper(trim(p_code)), phone_norm, p_order_id)
  on conflict (order_id) do nothing;
  if not found then return jsonb_build_object('ok',false,'reason','already_used'); end if;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.td_promo_usage_stats()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(code, count), '{}'::jsonb)
  from (select upper(promo_code) code, count(*)::integer count
        from public.td_promo_uses group by upper(promo_code)) x;
$$;

revoke all on function public.td_check_promo(text,text) from public;
revoke all on function public.td_consume_promo(text,text,text) from public;
revoke all on function public.td_promo_usage_stats() from public;
grant execute on function public.td_check_promo(text,text) to anon, authenticated;
grant execute on function public.td_consume_promo(text,text,text) to anon, authenticated;
grant execute on function public.td_promo_usage_stats() to anon, authenticated;
