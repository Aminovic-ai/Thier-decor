-- Thier Décor: secure atomic checkout + loyalty point redemption
-- REVIEW ONLY. Do NOT run until the branch has passed tests and schema has been checked.
-- Apply only after the base schema and THIER_DECOR_CUSTOMER_POINTS_ADDRESS_MIGRATION_REVIEW.sql.
-- Existing customer/order/product rows are preserved.

begin;

create table if not exists public.td_loyalty_redemptions (
  order_id bigint primary key references public.orders(id) on delete restrict,
  customer_id bigint not null references public.customers(id) on delete restrict,
  points integer not null check (points = 200),
  redeemed_at timestamptz not null default now()
);
alter table public.td_loyalty_redemptions enable row level security;
revoke all on public.td_loyalty_redemptions from anon, authenticated;

create or replace function public.td_create_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  it jsonb; comp jsonb; pid bigint; q numeric; component_id bigint; component_qty numeric;
  req jsonb := '{}'::jsonb; req_key text; req_qty numeric; stock_qty integer;
  inserted_id bigint; promo_code text; promo_phone text; promo_result jsonb;
  use_points boolean:=coalesce((p_order->>'useLoyaltyPoints')::boolean,false);
  customer_points integer; points_redeemed integer:=0;
  final_delivery numeric; final_total numeric; existing_order public.orders%rowtype; existing_redeemed integer:=0;
begin
  if jsonb_typeof(p_order) <> 'object' then raise exception 'Order payload must be a JSON object'; end if;
  if nullif(p_order->>'id','') is null or nullif(p_order->>'customerPhone','') is null then
    raise exception 'Order id and customer phone are required';
  end if;
  if jsonb_typeof(coalesce(p_order->'items','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_order->'items','[]'::jsonb)) = 0 then
    raise exception 'Order items must be a non-empty JSON array';
  end if;

  -- Repeated network submissions with the same order ID return the first result
  -- without charging stock, coupon usage or loyalty points a second time.
  perform pg_advisory_xact_lock(hashtext('td-order:' || (p_order->>'id')));
  select * into existing_order
    from public.orders
    where id=(p_order->>'id')::bigint
    for update;
  if found then
    if existing_order."customerId" is distinct from nullif(p_order->>'customerId','')::bigint then
      raise exception 'Order ID already belongs to another customer';
    end if;
    select points into existing_redeemed
      from public.td_loyalty_redemptions
      where order_id=existing_order.id;
    return jsonb_build_object(
      'ok',true,
      'order_id',existing_order.id,
      'points_redeemed',coalesce(existing_redeemed,0),
      'delivery_price',existing_order."deliveryPrice",
      'total',existing_order.total,
      'already_created',true
    );
  end if;

  -- Aggregate product and pack component quantities before locking anything.
  for it in select value from jsonb_array_elements(p_order->'items') loop
    begin pid := (it->>'id')::bigint; q := (it->>'qty')::numeric;
    exception when others then raise exception 'Invalid product id or quantity'; end;
    if pid is null or q is null or q <= 0 or q <> trunc(q) then raise exception 'Invalid product quantity'; end if;
    req := jsonb_set(req,array[pid::text],to_jsonb(coalesce((req->>pid::text)::numeric,0)+q),true);
    if coalesce((it->>'isPack')::boolean,false) and jsonb_typeof(coalesce(it->'packItems','[]'::jsonb))='array' then
      for comp in select value from jsonb_array_elements(coalesce(it->'packItems','[]'::jsonb)) loop
        begin component_id := (comp->>'id')::bigint; component_qty := (comp->>'qty')::numeric;
        exception when others then raise exception 'Invalid pack component'; end;
        if component_id is null or component_qty is null or component_qty <= 0 or component_qty <> trunc(component_qty) then
          raise exception 'Invalid pack component quantity';
        end if;
        req := jsonb_set(req,array[component_id::text],to_jsonb(coalesce((req->>component_id::text)::numeric,0)+(component_qty*q)),true);
      end loop;
    end if;
  end loop;

  -- Deterministic lock order reduces deadlock risk when orders overlap on products.
  for req_key, req_qty in select key, value::numeric from jsonb_each_text(req) order by key::bigint loop
    select qty into stock_qty from public.products where id=req_key::bigint for update;
    if not found then raise exception 'Required stock product % does not exist',req_key; end if;
    if stock_qty < req_qty then raise exception 'Insufficient stock for product % (required %, available %)',req_key,req_qty,stock_qty; end if;
  end loop;

  insert into public.orders (
    id, "customerId", "customerName", "customerPhone", items, "itemsTotal", discount,
    "couponCode", "promoCode", "promoDiscountPercent", "promoDiscountAmount",
    "deliveryPrice", total, courier, "deliveryType", wilaya, commune, address,
    "stationCode", "stationName", "stationAddress", status, "createdAt", "paidAmount",
    "trackingNumber", weight, "phone2"
  ) values (
    (p_order->>'id')::bigint, nullif(p_order->>'customerId','')::bigint,
    p_order->>'customerName', p_order->>'customerPhone', p_order->'items',
    coalesce(nullif(p_order->>'itemsTotal','')::numeric,0), coalesce(nullif(p_order->>'discount','')::numeric,0),
    p_order->>'couponCode', p_order->>'promoCode', coalesce(nullif(p_order->>'promoDiscountPercent','')::numeric,0),
    coalesce(nullif(p_order->>'promoDiscountAmount','')::numeric,0),
    coalesce(nullif(p_order->>'deliveryPrice','')::numeric,0), coalesce(nullif(p_order->>'total','')::numeric,0),
    p_order->>'courier', p_order->>'deliveryType', p_order->>'wilaya', p_order->>'commune', p_order->>'address',
    p_order->>'stationCode', p_order->>'stationName', p_order->>'stationAddress',
    coalesce(nullif(p_order->>'status',''),'new'), coalesce(nullif(p_order->>'createdAt','')::timestamptz,now()),
    nullif(p_order->>'paidAmount','')::numeric, p_order->>'trackingNumber', p_order->>'weight', p_order->>'phone2'
  ) returning id into inserted_id;

  promo_code := upper(trim(coalesce(nullif(p_order->>'promoCode',''),p_order->>'couponCode','')));
  promo_phone := p_order->>'customerPhone';
  if promo_code <> '' then
    promo_result := public.td_consume_promo(promo_code,promo_phone,inserted_id::text);
    if coalesce((promo_result->>'ok')::boolean,false) is not true then
      raise exception 'Coupon could not be consumed: %',coalesce(promo_result->>'reason','invalid_coupon');
    end if;
  end if;

  for req_key, req_qty in select key, value::numeric from jsonb_each_text(req) order by key::bigint loop
    update public.products set qty = qty - req_qty::integer where id=req_key::bigint;
  end loop;

  if use_points then
    if nullif(p_order->>'customerId','') is null then
      raise exception 'Customer account is required to redeem loyalty points';
    end if;
    select points into customer_points
      from public.customers
      where id=(p_order->>'customerId')::bigint
      for update;
    if not found then raise exception 'Customer account not found'; end if;
    if coalesce(customer_points,0)<200 then
      raise exception 'At least 200 loyalty points are required';
    end if;

    insert into public.td_loyalty_redemptions(order_id,customer_id,points)
      values(inserted_id,(p_order->>'customerId')::bigint,200);
    update public.customers
      set points=coalesce(points,0)-200
      where id=(p_order->>'customerId')::bigint;
    update public.orders
      set "deliveryPrice"=0,
          total=greatest(0,"itemsTotal"-discount)
      where id=inserted_id
      returning "deliveryPrice",total into final_delivery,final_total;
    points_redeemed:=200;
  else
    select "deliveryPrice",total into final_delivery,final_total
      from public.orders where id=inserted_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',inserted_id,
    'points_redeemed',points_redeemed,
    'delivery_price',final_delivery,
    'total',final_total
  );
end;
$$;

revoke all on function public.td_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.td_create_order(jsonb) to service_role;

-- Read-only verification: this block does not call the order RPC.
do $$
begin
  if to_regprocedure('public.td_create_order(jsonb)') is null then
    raise exception 'td_create_order(jsonb) was not created';
  end if;
  if to_regclass('public.td_loyalty_redemptions') is null then
    raise exception 'td_loyalty_redemptions was not created';
  end if;
end $$;

commit;
