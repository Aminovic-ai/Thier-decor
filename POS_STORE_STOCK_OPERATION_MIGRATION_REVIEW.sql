-- Thier Décor POS dual-database bridge — STORE DATABASE
-- REVIEW ONLY. Do not execute until reviewed against the live schema and tested in an isolated project.
-- This migration belongs ONLY to store project xdsbnmtthvqgdlytwpes.
-- It creates a durable idempotency ledger and deducts the store's single source-of-truth stock.

begin;

create table if not exists public.td_pos_stock_operations (
  operation_id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  request_payload jsonb not null,
  canonical_items jsonb not null,
  required_stock jsonb not null,
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null,
  total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

alter table public.td_pos_stock_operations enable row level security;
revoke all on public.td_pos_stock_operations from public, anon, authenticated;
grant select, insert, update on public.td_pos_stock_operations to service_role;

create or replace function public.td_pos_commit_stock(p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_key uuid;
  v_existing public.td_pos_stock_operations%rowtype;
  v_item jsonb;
  v_component jsonb;
  v_product public.products%rowtype;
  v_component_id bigint;
  v_component_qty numeric;
  v_product_id bigint;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_is_pack boolean;
  v_pack_items jsonb;
  v_required jsonb := '{}'::jsonb;
  v_canonical jsonb := '[]'::jsonb;
  v_key text;
  v_required_qty numeric;
  v_stock integer;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2);
  v_operation_id uuid;
  v_created_at timestamptz;
begin
  if jsonb_typeof(p_sale) <> 'object'
     or jsonb_typeof(p_sale->'items') <> 'array'
     or jsonb_array_length(p_sale->'items') < 1
     or jsonb_array_length(p_sale->'items') > 100 then
    raise exception 'Invalid POS sale payload';
  end if;

  begin
    v_request_key := (p_sale->>'request_key')::uuid;
  exception when others then
    raise exception 'A valid request_key is required';
  end;

  -- Serialize same-key retries. The stock ledger and qty updates share this transaction.
  perform pg_advisory_xact_lock(hashtext('td-pos-stock:' || v_request_key::text));

  select * into v_existing
  from public.td_pos_stock_operations
  where request_key = v_request_key
  for update;

  if found then
    if v_existing.request_payload <> p_sale then
      raise exception 'request_key was already used with a different sale payload';
    end if;
    return jsonb_build_object(
      'ok', true,
      'operation_id', v_existing.operation_id,
      'items', v_existing.canonical_items,
      'subtotal', v_existing.subtotal,
      'discount', v_existing.discount,
      'total', v_existing.total,
      'created_at', v_existing.created_at,
      'already_committed', true
    );
  end if;

  -- Lock/read products in ascending top-level id order.
  for v_item in
    select value from jsonb_array_elements(p_sale->'items')
    order by (value->>'id')::bigint
  loop
    if coalesce(v_item->>'id','') !~ '^[0-9]{1,18}$'
       or coalesce(v_item->>'qty','') !~ '^[0-9]{1,6}$' then
      raise exception 'Invalid product id or quantity';
    end if;
    v_product_id := (v_item->>'id')::bigint;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_qty > 1000 then
      raise exception 'Invalid product quantity';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;

    v_price := coalesce(v_product.price, 0);
    v_cost := coalesce(v_product.cost, 0);
    if v_price < 0 or v_cost < 0 then
      raise exception 'Invalid price or cost for product %', v_product_id;
    end if;

    v_is_pack := coalesce(v_product."isPack", false);
    v_pack_items := case when v_is_pack then coalesce(v_product."packItems", '[]'::jsonb) else '[]'::jsonb end;
    if v_is_pack and (jsonb_typeof(v_pack_items) <> 'array' or jsonb_array_length(v_pack_items) = 0) then
      raise exception 'Pack % has no valid components', v_product_id;
    end if;

    v_required := jsonb_set(
      v_required, array[v_product_id::text],
      to_jsonb(coalesce((v_required->>v_product_id::text)::numeric,0) + v_qty), true
    );

    if v_is_pack then
      for v_component in select value from jsonb_array_elements(v_pack_items) loop
        if coalesce(v_component->>'id','') !~ '^[0-9]{1,18}$'
           or coalesce(v_component->>'qty','') !~ '^[0-9]{1,6}$' then
          raise exception 'Invalid component definition in pack %', v_product_id;
        end if;
        v_component_id := (v_component->>'id')::bigint;
        v_component_qty := (v_component->>'qty')::numeric * v_qty;
        if v_component_qty <= 0 then
          raise exception 'Invalid component quantity in pack %', v_product_id;
        end if;
        v_required := jsonb_set(
          v_required, array[v_component_id::text],
          to_jsonb(coalesce((v_required->>v_component_id::text)::numeric,0) + v_component_qty), true
        );
      end loop;
    end if;

    v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id::text,
      'product_name', coalesce(v_product.name,''),
      'quantity', v_qty,
      'unit_price', v_price,
      'unit_cost', v_cost,
      'line_total', round(v_price * v_qty, 2),
      'is_pack', v_is_pack,
      'pack_snapshot', v_pack_items
    ));
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  -- Lock and validate every required stock row in globally sorted order.
  for v_key, v_required_qty in
    select key, value::numeric from jsonb_each_text(v_required) order by key::bigint
  loop
    if v_required_qty <= 0 or v_required_qty <> trunc(v_required_qty) or v_required_qty > 2147483647 then
      raise exception 'Stock quantities must be positive integers';
    end if;
    select qty into v_stock
    from public.products
    where id = v_key::bigint
    for update;
    if not found then
      raise exception 'Required component % not found', v_key;
    end if;
    if v_stock < v_required_qty then
      raise exception 'Insufficient stock for product % (required %, available %)',
        v_key, v_required_qty, v_stock;
    end if;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_discount := coalesce(nullif(p_sale->>'discount','')::numeric, 0);
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Invalid POS discount';
  end if;
  v_discount := round(v_discount, 2);
  v_total := round(v_subtotal - v_discount, 2);

  -- Preserve the current web-order stock semantics: a pack consumes its own
  -- stock row AND the component quantities declared in packItems.
  for v_key, v_required_qty in
    select key, value::numeric from jsonb_each_text(v_required) order by key::bigint
  loop
    update public.products
    set qty = qty - v_required_qty::integer
    where id = v_key::bigint;
  end loop;

  v_operation_id := gen_random_uuid();
  v_created_at := now();

  insert into public.td_pos_stock_operations (
    operation_id, request_key, request_payload, canonical_items,
    required_stock, subtotal, discount, total, created_at
  ) values (
    v_operation_id, v_request_key, p_sale, v_canonical,
    v_required, v_subtotal, v_discount, v_total, v_created_at
  );

  return jsonb_build_object(
    'ok', true,
    'operation_id', v_operation_id,
    'items', v_canonical,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_total,
    'created_at', v_created_at,
    'already_committed', false
  );
end;
$$;

revoke all on function public.td_pos_commit_stock(jsonb) from public, anon, authenticated;
grant execute on function public.td_pos_commit_stock(jsonb) to service_role;

commit;
