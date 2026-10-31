-- Thier Décor V2 final security + canonical stock operations
-- REVIEW ONLY. DO NOT RUN on production. Apply only on a disposable/staging database
-- after the base schema and the prerequisite phone, points, packs and loyalty migrations.
-- This migration preserves existing business rows. It changes function grants and adds
-- privacy-minimised visit deduplication metadata.

begin;

-- 1) Canonical order lines are reconstructed from products, never from client names/prices/costs/pack data.
create or replace function public.td_build_order_items(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  raw_item jsonb;
  raw_component jsonb;
  product_row public.products%rowtype;
  component_row public.products%rowtype;
  product_id bigint;
  qty numeric;
  component_id bigint;
  component_qty numeric;
  line_price numeric;
  canonical_items jsonb := '[]'::jsonb;
  canonical_components jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'Order items must be a non-empty array of at most 100 lines';
  end if;

  for raw_item in select value from jsonb_array_elements(p_items) loop
    begin
      product_id := (raw_item->>'id')::bigint;
      qty := (raw_item->>'qty')::numeric;
    exception when others then
      raise exception 'Invalid product ID or quantity';
    end;
    if product_id is null or qty is null or qty<=0 or qty<>trunc(qty) or qty>1000 then
      raise exception 'Invalid product quantity';
    end if;

    select * into product_row from public.products where id=product_id for share;
    if not found then raise exception 'Product % no longer exists',product_id; end if;

    if product_row."promoPrice" is not null
       and product_row."promoPrice">0 and product_row."promoPrice"<product_row.price
       and (product_row."promoStart" is null or product_row."promoStart"<=current_date)
       and (product_row."promoEnd" is null or product_row."promoEnd">=current_date) then
      line_price := product_row."promoPrice";
    else
      line_price := product_row.price;
    end if;

    canonical_components := '[]'::jsonb;
    if coalesce(product_row."isPack",false) then
      if jsonb_typeof(coalesce(product_row."packItems",'[]'::jsonb))<>'array'
         or jsonb_array_length(coalesce(product_row."packItems",'[]'::jsonb))=0 then
        raise exception 'Pack % has no valid components',product_id;
      end if;
      for raw_component in select value from jsonb_array_elements(product_row."packItems") loop
        begin
          component_id := (raw_component->>'id')::bigint;
          component_qty := (raw_component->>'qty')::numeric;
        exception when others then
          raise exception 'Invalid component in pack %',product_id;
        end;
        if component_id is null or component_qty is null or component_qty<=0
           or component_qty<>trunc(component_qty) or component_qty>1000 then
          raise exception 'Invalid component quantity in pack %',product_id;
        end if;
        select * into component_row from public.products where id=component_id for share;
        if not found then raise exception 'Pack component % no longer exists',component_id; end if;
        canonical_components := canonical_components || jsonb_build_array(
          jsonb_build_object('id',component_row.id,'name',component_row.name,'qty',component_qty)
        );
      end loop;
    end if;

    canonical_items := canonical_items || jsonb_build_array(jsonb_build_object(
      'id',product_row.id,
      'name',product_row.name,
      'price',line_price,
      'cost',coalesce(product_row.cost,0),
      'qty',qty,
      'isPack',coalesce(product_row."isPack",false),
      'packItems',canonical_components
    ));
  end loop;
  return canonical_items;
end;
$$;

create or replace function public.td_order_stock_requirements(p_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  item jsonb;
  component jsonb;
  product_id bigint;
  qty numeric;
  component_id bigint;
  component_qty numeric;
  required jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_items)<>'array' then raise exception 'Canonical order items must be an array'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    product_id := (item->>'id')::bigint;
    qty := (item->>'qty')::numeric;
    if product_id is null or qty is null or qty<=0 or qty<>trunc(qty) then raise exception 'Invalid canonical item'; end if;
    required := jsonb_set(required,array[product_id::text],
      to_jsonb(coalesce((required->>product_id::text)::numeric,0)+qty),true);
    if coalesce((item->>'isPack')::boolean,false) then
      for component in select value from jsonb_array_elements(coalesce(item->'packItems','[]'::jsonb)) loop
        component_id := (component->>'id')::bigint;
        component_qty := (component->>'qty')::numeric;
        if component_id is null or component_qty is null or component_qty<=0 or component_qty<>trunc(component_qty) then
          raise exception 'Invalid canonical pack component';
        end if;
        required := jsonb_set(required,array[component_id::text],
          to_jsonb(coalesce((required->>component_id::text)::numeric,0)+(component_qty*qty)),true);
      end loop;
    end if;
  end loop;
  return required;
end;
$$;

create or replace function public.td_order_snapshot_safe(p_items jsonb)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $
declare
  item jsonb;
  stored_component jsonb;
  db_component jsonb;
  product_row public.products%rowtype;
  product_id bigint;
  component_index bigint;
  stored_components jsonb;
  db_components jsonb;
begin
  if jsonb_typeof(p_items)<>'array' then return false; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    begin product_id := (item->>'id')::bigint; exception when others then return false; end;
    select * into product_row from public.products where id=product_id for share;
    if not found then return false; end if;
    if coalesce((item->>'isPack')::boolean,false) is distinct from coalesce(product_row."isPack",false) then return false; end if;
    stored_components := coalesce(item->'packItems','[]'::jsonb);
    db_components := case when coalesce(product_row."isPack",false) then coalesce(product_row."packItems",'[]'::jsonb) else '[]'::jsonb end;
    if jsonb_typeof(stored_components)<>'array' or jsonb_typeof(db_components)<>'array' then return false; end if;
    if jsonb_array_length(stored_components)<>jsonb_array_length(db_components) then return false; end if;
    for stored_component,component_index in
      select value,ordinality from jsonb_array_elements(stored_components) with ordinality
    loop
      select value into db_component from jsonb_array_elements(db_components) with ordinality where ordinality=component_index;
      if (stored_component->>'id')::bigint is distinct from (db_component->>'id')::bigint
         or (stored_component->>'qty')::numeric is distinct from (db_component->>'qty')::numeric then
        return false;
      end if;
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end;
$;

create or replace function public.td_consume_promo(p_code text,p_phone text,p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $
declare
  code_norm text:=upper(trim(coalesce(p_code,'')));
  phone_norm text:=public.td_normalize_phone(p_phone);
  order_phone text;
  old_code text;
  old_phone text;
  validation jsonb;
begin
  if code_norm='' or phone_norm='' or coalesce(p_order_id,'')='' then
    return jsonb_build_object('ok',false,'reason','missing_order_or_promo');
  end if;
  select public.td_normalize_phone("customerPhone") into order_phone
    from public.orders where id::text=p_order_id;
  if order_phone is null then return jsonb_build_object('ok',false,'reason','order_not_found'); end if;
  if order_phone<>phone_norm then return jsonb_build_object('ok',false,'reason','order_phone_mismatch'); end if;

  perform pg_advisory_xact_lock(hashtext(code_norm||':'||phone_norm));
  select upper(promo_code),customer_phone into old_code,old_phone
    from public.td_promo_uses where order_id=p_order_id;
  if found then
    if old_code=code_norm and old_phone=phone_norm then return jsonb_build_object('ok',true,'already_recorded',true); end if;
    return jsonb_build_object('ok',false,'reason','order_already_has_different_promo');
  end if;

  validation:=public.td_check_promo(code_norm,p_phone);
  if coalesce((validation->>'valid')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'reason',validation->>'reason');
  end if;
  insert into public.td_promo_uses(promo_code,customer_phone,order_id)
    values(code_norm,phone_norm,p_order_id);
  return jsonb_build_object('ok',true);
end;
$;

-- 2) Replace checkout RPC: trusted customer identity + canonical item snapshot + one transaction.
create or replace function public.td_create_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  customer_id bigint;
  customer_row public.customers%rowtype;
  canonical_items jsonb;
  required jsonb;
  item_key text;
  required_qty numeric;
  stock_qty integer;
  inserted_id bigint;
  existing_order public.orders%rowtype;
  existing_redeemed integer:=0;
  promo_code text;
  promo_result jsonb;
  use_points boolean:=coalesce((p_order->>'useLoyaltyPoints')::boolean,false);
  points_redeemed integer:=0;
  final_delivery numeric;
  final_total numeric;
begin
  if jsonb_typeof(p_order)<>'object' then raise exception 'Order payload must be a JSON object'; end if;
  if nullif(p_order->>'id','') is null then raise exception 'Order ID is required'; end if;
  begin customer_id := (p_order->>'customerId')::bigint; exception when others then raise exception 'Customer account is required'; end;
  if customer_id is null then raise exception 'Customer account is required'; end if;

  perform pg_advisory_xact_lock(hashtext('td-order:'||(p_order->>'id')));
  select * into existing_order from public.orders where id=(p_order->>'id')::bigint for update;
  if found then
    if existing_order."customerId" is distinct from customer_id then raise exception 'Order ID already belongs to another customer'; end if;
    select points into existing_redeemed from public.td_loyalty_redemptions where order_id=existing_order.id;
    return jsonb_build_object('ok',true,'order_id',existing_order.id,'points_redeemed',coalesce(existing_redeemed,0),
      'delivery_price',existing_order."deliveryPrice",'total',existing_order.total,'already_created',true);
  end if;

  select * into customer_row from public.customers where id=customer_id for update;
  if not found or coalesce(customer_row."isBlocked",false) then raise exception 'Customer account is not available'; end if;
  if public.td_normalize_phone(customer_row.phone) <> public.td_normalize_phone(p_order->>'customerPhone') then
    raise exception 'Customer phone does not match the authenticated account';
  end if;

  canonical_items := public.td_build_order_items(p_order->'items');
  required := public.td_order_stock_requirements(canonical_items);

  for item_key,required_qty in select key,value::numeric from jsonb_each_text(required) order by key::bigint loop
    select qty into stock_qty from public.products where id=item_key::bigint for update;
    if not found then raise exception 'Required stock product % does not exist',item_key; end if;
    if stock_qty < required_qty then raise exception 'Insufficient stock for product % (required %, available %)',item_key,required_qty,stock_qty; end if;
  end loop;

  insert into public.orders (
    id,"customerId","customerName","customerPhone",items,"itemsTotal",discount,
    "couponCode","promoCode","promoDiscountPercent","promoDiscountAmount",
    "deliveryPrice",total,courier,"deliveryType",wilaya,commune,address,
    "stationCode","stationName","stationAddress",status,"createdAt","paidAmount",
    "trackingNumber",weight,"phone2"
  ) values (
    (p_order->>'id')::bigint,customer_row.id,customer_row.name,customer_row.phone,canonical_items,0,0,
    nullif(p_order->>'couponCode',''),nullif(p_order->>'promoCode',''),0,0,
    0,0,nullif(trim(coalesce(p_order->>'courier','')),''),nullif(trim(coalesce(p_order->>'deliveryType','')),''),
    nullif(trim(coalesce(p_order->>'wilaya','')),''),nullif(trim(coalesce(p_order->>'commune','')),''),nullif(trim(coalesce(p_order->>'address','')),''),
    nullif(trim(coalesce(p_order->>'stationCode','')),''),nullif(trim(coalesce(p_order->>'stationName','')),''),nullif(trim(coalesce(p_order->>'stationAddress','')),''),
    'new',now(),0,null,nullif(trim(coalesce(p_order->>'weight','')),''),nullif(trim(coalesce(p_order->>'phone2','')),'')
  ) returning id into inserted_id;

  promo_code := upper(trim(coalesce(nullif(p_order->>'promoCode',''),p_order->>'couponCode','')));
  if promo_code<>'' then
    promo_result := public.td_consume_promo(promo_code,customer_row.phone,inserted_id::text);
    if coalesce((promo_result->>'ok')::boolean,false) is not true then
      raise exception 'Coupon could not be consumed: %',coalesce(promo_result->>'reason','invalid_coupon');
    end if;
  end if;

  for item_key,required_qty in select key,value::numeric from jsonb_each_text(required) order by key::bigint loop
    update public.products set qty=qty-required_qty::integer where id=item_key::bigint;
  end loop;

  if use_points then
    if coalesce(customer_row.points,0)<200 then raise exception 'At least 200 loyalty points are required'; end if;
    insert into public.td_loyalty_redemptions(order_id,customer_id,points)
      values(inserted_id,customer_row.id,200);
    update public.customers set points=coalesce(points,0)-200 where id=customer_row.id;
    update public.orders set "deliveryPrice"=0,total=greatest(0,"itemsTotal"-discount)
      where id=inserted_id returning "deliveryPrice",total into final_delivery,final_total;
    points_redeemed:=200;
  else
    select "deliveryPrice",total into final_delivery,final_total from public.orders where id=inserted_id;
  end if;

  return jsonb_build_object('ok',true,'order_id',inserted_id,'points_redeemed',points_redeemed,
    'delivery_price',final_delivery,'total',final_total);
end;
$$;

-- 3) Atomic edit and delete; use only the canonical snapshot saved on the order.
create or replace function public.td_admin_edit_order(p_order_id bigint,p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  order_row public.orders%rowtype;
  new_items jsonb;
  old_req jsonb;
  new_req jsonb;
  item_key text;
  old_qty numeric;
  new_qty numeric;
  stock_qty integer;
  subtotal numeric:=0;
  item jsonb;
  discount_amount numeric:=0;
begin
  select * into order_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.status in ('delivered','cancelled') then raise exception 'Delivered or cancelled orders cannot be edited'; end if;
  if exists(select 1 from public.td_loyalty_redemptions where order_id=p_order_id)
     or exists(select 1 from public.td_loyalty_awards where order_id=p_order_id) then
    raise exception 'Orders with loyalty history cannot be edited';
  end if;

  if not public.td_order_snapshot_safe(order_row.items) then
    raise exception 'Legacy order stock snapshot is not verifiable; manual stock audit required';
  end if;
  new_items := public.td_build_order_items(p_items);
  old_req := public.td_order_stock_requirements(order_row.items);
  new_req := public.td_order_stock_requirements(new_items);

  for item_key in
    select key from (
      select key from jsonb_each_text(old_req)
      union
      select key from jsonb_each_text(new_req)
    ) q order by key::bigint
  loop
    old_qty := coalesce((old_req->>item_key)::numeric,0);
    new_qty := coalesce((new_req->>item_key)::numeric,0);
    select qty into stock_qty from public.products where id=item_key::bigint for update;
    if not found then raise exception 'Required stock product % does not exist',item_key; end if;
    if stock_qty+old_qty<new_qty then raise exception 'Insufficient stock for product %',item_key; end if;
    update public.products set qty=qty+old_qty-new_qty where id=item_key::bigint;
  end loop;

  for item in select value from jsonb_array_elements(new_items) loop
    subtotal := subtotal + (item->>'price')::numeric * (item->>'qty')::numeric;
  end loop;
  if coalesce(order_row."promoCode",order_row."couponCode",'')<>'' then
    discount_amount := round(subtotal*greatest(0,least(100,coalesce(order_row."promoDiscountPercent",0)))/100,2);
  else
    discount_amount := least(subtotal,greatest(0,coalesce(order_row.discount,0)));
  end if;

  update public.orders set items=new_items,"itemsTotal"=subtotal,discount=discount_amount,
    "promoDiscountAmount"=discount_amount,total=greatest(0,subtotal-discount_amount)+coalesce(order_row."deliveryPrice",0)
    where id=p_order_id;
  return jsonb_build_object('ok',true,'order_id',p_order_id);
end;
$$;

create or replace function public.td_admin_delete_order(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  order_row public.orders%rowtype;
  required jsonb;
  item_key text;
  required_qty numeric;
begin
  select * into order_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.status='delivered' then raise exception 'Delivered orders cannot be deleted'; end if;
  if exists(select 1 from public.td_loyalty_redemptions where order_id=p_order_id)
     or exists(select 1 from public.td_loyalty_awards where order_id=p_order_id) then
    raise exception 'Orders with loyalty history cannot be deleted; preserve the audit history';
  end if;
  if not public.td_order_snapshot_safe(order_row.items) then
    raise exception 'Legacy order stock snapshot is not verifiable; manual stock audit required';
  end if;

  if order_row.status<>'cancelled' then
    required := public.td_order_stock_requirements(order_row.items);
    for item_key,required_qty in select key,value::numeric from jsonb_each_text(required) order by key::bigint loop
      perform 1 from public.products where id=item_key::bigint for update;
      if not found then raise exception 'Required stock product % does not exist',item_key; end if;
      update public.products set qty=qty+required_qty::integer where id=item_key::bigint;
    end loop;
  end if;

  delete from public.td_promo_uses where order_id=p_order_id::text;
  delete from public.orders where id=p_order_id;
  return jsonb_build_object('ok',true,'order_id',p_order_id);
end;
$$;

-- 4) Refund redeemed points exactly once when an order is cancelled; award delivered points once.
alter table public.td_loyalty_redemptions add column if not exists refunded_at timestamptz;

create or replace function public.td_admin_update_order_status(p_order_id bigint,p_status text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  order_row public.orders%rowtype;
  required jsonb;
  item_key text;
  required_qty numeric;
  redeemed integer:=0;
  awarded integer:=0;
begin
  if p_status not in ('new','confirmed','on_the_way','out_for_delivery','delivered','cancelled') then
    raise exception 'Invalid order status';
  end if;
  select * into order_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.status=p_status then
    return jsonb_build_object('ok',true,'order_id',p_order_id,'status',p_status,'points_awarded',0,'points_refunded',0);
  end if;
  if order_row.status='cancelled' then raise exception 'Cancelled orders cannot be reopened'; end if;
  if order_row.status='delivered' then raise exception 'Delivered orders cannot change status'; end if;

  if p_status='cancelled' then
    if not public.td_order_snapshot_safe(order_row.items) then
      raise exception 'Legacy order stock snapshot is not verifiable; manual stock audit required';
    end if;
    required := public.td_order_stock_requirements(order_row.items);
    for item_key,required_qty in select key,value::numeric from jsonb_each_text(required) order by key::bigint loop
      perform 1 from public.products where id=item_key::bigint for update;
      if not found then raise exception 'Required stock product % does not exist',item_key; end if;
      update public.products set qty=qty+required_qty::integer where id=item_key::bigint;
    end loop;
    update public.td_loyalty_redemptions set refunded_at=now()
      where order_id=p_order_id and refunded_at is null returning points into redeemed;
    if coalesce(redeemed,0)>0 then
      update public.customers set points=coalesce(points,0)+redeemed
        where id=order_row."customerId";
    end if;
    delete from public.td_promo_uses where order_id=p_order_id::text;
  end if;

  update public.orders set status=p_status where id=p_order_id returning * into order_row;
  if p_status='delivered' and coalesce(order_row.total,0)>10000 and order_row."customerId" is not null then
    insert into public.td_loyalty_awards(order_id,customer_id,points)
      values(order_row.id,order_row."customerId",40) on conflict(order_id) do nothing;
    if found then
      update public.customers set points=coalesce(points,0)+40 where id=order_row."customerId";
      awarded:=40;
    end if;
  end if;
  return jsonb_build_object('ok',true,'order_id',p_order_id,'status',p_status,
    'points_awarded',awarded,'points_refunded',coalesce(redeemed,0));
end;
$$;

-- 5) Reduce public coupon validation output; keep only storefront-required fields.
create or replace function public.td_check_promo(p_code text,p_phone text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  cp jsonb;
  used_count integer;
  phone_norm text:=public.td_normalize_phone(p_phone);
  code_norm text:=upper(trim(coalesce(p_code,'')));
  max_uses integer;
begin
  if code_norm='' or phone_norm='' then return jsonb_build_object('valid',false,'reason','missing'); end if;
  select elem into cp from public.settings s,
    lateral jsonb_array_elements(case when jsonb_typeof(coalesce(s.coupons,'[]'::jsonb))='array' then s.coupons else '[]'::jsonb end) elem
    where s.id=1 and upper(trim(coalesce(elem->>'code','')))=code_norm limit 1;
  if cp is null then return jsonb_build_object('valid',false,'reason','not_found'); end if;
  if lower(coalesce(cp->>'active','true')) in ('false','0','no') then return jsonb_build_object('valid',false,'reason','inactive'); end if;
  if public.td_normalize_phone(cp->>'phone')<>phone_norm then return jsonb_build_object('valid',false,'reason','phone_mismatch'); end if;
  if nullif(cp->>'expiresAt','') is not null then
    begin if (cp->>'expiresAt')::timestamptz<now() then return jsonb_build_object('valid',false,'reason','expired'); end if;
    exception when others then return jsonb_build_object('valid',false,'reason','expired'); end;
  end if;
  begin max_uses:=greatest(1,coalesce((cp->>'maxUses')::integer,1)); exception when others then max_uses:=1; end;
  select count(*)::integer into used_count from public.td_promo_uses
    where upper(promo_code)=code_norm and customer_phone=phone_norm;
  if used_count>=max_uses then return jsonb_build_object('valid',false,'reason','limit_reached'); end if;
  return jsonb_build_object('valid',true,'code',code_norm,
    'discount',greatest(0,least(100,coalesce((cp->>'discount')::numeric,0))));
end;
$$;

-- 6) Authentication throttling stores only keyed hashes, never raw phone numbers or IP addresses.
create table if not exists public.td_customer_auth_attempts (
  id bigint generated always as identity primary key,
  phone_hash text not null,
  ip_hash text not null,
  action text not null check(action in ('login','register','reset')),
  attempted_at timestamptz not null default now()
);
create index if not exists td_customer_auth_phone_time_idx
  on public.td_customer_auth_attempts(phone_hash,action,attempted_at);
create index if not exists td_customer_auth_ip_time_idx
  on public.td_customer_auth_attempts(ip_hash,attempted_at);
alter table public.td_customer_auth_attempts enable row level security;
revoke all on public.td_customer_auth_attempts from public,anon,authenticated;

-- 6) Visitor deduplication + daily IP-hash rate limit. Raw IP addresses are never stored.
create table if not exists public.td_visit_sessions (
  session_hash text primary key,
  ip_hash text not null,
  visited_at timestamptz not null default now(),
  page_path text not null default '/'
);
create index if not exists td_visit_sessions_ip_time_idx on public.td_visit_sessions(ip_hash,visited_at);
alter table public.td_visit_sessions enable row level security;
revoke all on public.td_visit_sessions from public,anon,authenticated;

create or replace function public.td_record_visit_safe(p_path text,p_session_key text,p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  session_hash text;
  recent_count integer;
begin
  if coalesce(p_session_key,'')='' or coalesce(p_ip_hash,'')='' then
    return jsonb_build_object('recorded',false,'reason','missing');
  end if;
  session_hash:=encode(digest(p_session_key,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(p_ip_hash));
  if exists(select 1 from public.td_visit_sessions where td_visit_sessions.session_hash=session_hash) then
    return jsonb_build_object('recorded',false,'reason','duplicate');
  end if;
  select count(*)::integer into recent_count from public.td_visit_sessions
    where ip_hash=p_ip_hash and visited_at>now()-interval '24 hours';
  if recent_count>=40 then return jsonb_build_object('recorded',false,'reason','rate_limited'); end if;
  insert into public.td_visit_sessions(session_hash,ip_hash,page_path)
    values(session_hash,p_ip_hash,left(coalesce(nullif(p_path,''),'/'),240))
    on conflict(session_hash) do nothing;
  return jsonb_build_object('recorded',found);
end;
$$;

create or replace function public.td_get_visit_stats()
returns json
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select json_build_object(
    'today_visits',count(*) filter(where visited_at>=date_trunc('day',now())),
    'total_visits',count(*)
  ) from public.td_visit_sessions;
$$;

-- 7) Function execution is restricted to the server Worker, except minimal coupon validation.
revoke all on function public.td_build_order_items(jsonb) from public,anon,authenticated;
revoke all on function public.td_order_stock_requirements(jsonb) from public,anon,authenticated;
revoke all on function public.td_order_snapshot_safe(jsonb) from public,anon,authenticated;
revoke all on function public.td_consume_promo(text,text,text) from public,anon,authenticated;
revoke all on function public.td_create_order(jsonb) from public,anon,authenticated;
revoke all on function public.td_admin_edit_order(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.td_admin_delete_order(bigint) from public,anon,authenticated;
revoke all on function public.td_admin_update_order_status(bigint,text) from public,anon,authenticated;
revoke all on function public.td_consume_promo(text,text,text) from public,anon,authenticated;
revoke all on function public.td_promo_usage_stats() from public,anon,authenticated;
revoke all on function public.td_get_visit_stats() from public,anon,authenticated;
revoke all on function public.td_record_visit(text) from public,anon,authenticated;
revoke all on function public.td_record_visit_safe(text,text,text) from public,anon,authenticated;
grant execute on function public.td_create_order(jsonb) to service_role;
grant execute on function public.td_admin_edit_order(bigint,jsonb) to service_role;
grant execute on function public.td_admin_delete_order(bigint) to service_role;
grant execute on function public.td_admin_update_order_status(bigint,text) to service_role;
grant execute on function public.td_consume_promo(text,text,text) to service_role;
grant execute on function public.td_promo_usage_stats() to service_role;
grant execute on function public.td_get_visit_stats() to service_role;
grant execute on function public.td_record_visit_safe(text,text,text) to service_role;
grant execute on function public.td_check_promo(text,text) to anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.td_create_order(jsonb)') is null
     or to_regprocedure('public.td_admin_edit_order(bigint,jsonb)') is null
     or to_regprocedure('public.td_admin_delete_order(bigint)') is null
     or to_regprocedure('public.td_record_visit_safe(text,text,text)') is null then
    raise exception 'V2 security verification failed: required functions are missing';
  end if;
  if has_function_privilege('anon','public.td_create_order(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.td_admin_delete_order(bigint)','EXECUTE')
     or has_function_privilege('anon','public.td_promo_usage_stats()','EXECUTE')
     or has_function_privilege('anon','public.td_get_visit_stats()','EXECUTE') then
    raise exception 'V2 security verification failed: public execution remains on a privileged function';
  end if;
  if not has_function_privilege('service_role','public.td_create_order(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.td_admin_edit_order(bigint,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.td_admin_delete_order(bigint)','EXECUTE') then
    raise exception 'V2 security verification failed: service_role is missing required privileges';
  end if;
end;
$$;

commit;

-- IMPORTANT:
-- This is a review migration only. Do not execute until schema and function signatures
-- are checked on a disposable Supabase project. Apply after the base schema, phone,
-- points/address, loyalty redemption and coupon migrations. Never rerun the base schema
-- after this migration because it re-grants public RPC permissions.
-- Cloudflare Worker must define VISIT_RATE_SECRET as a Worker secret before visit tracking works.
