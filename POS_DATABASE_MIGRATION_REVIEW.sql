-- Thier Décor POS dual-database bridge — POS DATABASE
-- REVIEW ONLY. Do not execute until tested against a disposable POS project.
-- This migration belongs ONLY to POS project obxjemvuympyddckghom.
-- It evolves the existing pos_sales / pos_sale_items tables additively.

begin;

alter table public.pos_sales
  add column if not exists request_key uuid,
  add column if not exists stock_operation_id uuid,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists cashier_uid text,
  add column if not exists store_name text not null default 'Thier Décor',
  add column if not exists store_phone text not null default '',
  add column if not exists store_address text not null default '',
  add column if not exists request_fingerprint text;

alter table public.pos_sale_items
  add column if not exists is_pack boolean not null default false,
  add column if not exists pack_snapshot jsonb not null default '[]'::jsonb;

create unique index if not exists pos_sales_request_key_uidx
  on public.pos_sales(request_key)
  where request_key is not null;

create unique index if not exists pos_sales_stock_operation_uidx
  on public.pos_sales(stock_operation_id)
  where stock_operation_id is not null;

create index if not exists pos_sales_created_at_idx
  on public.pos_sales(created_at desc);

create index if not exists pos_sale_items_product_id_idx
  on public.pos_sale_items(product_id);

create or replace function public.td_pos_record_sale(p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_key uuid;
  v_stock_operation_id uuid;
  v_fingerprint text;
  v_existing public.pos_sales%rowtype;
  v_sale_id uuid;
  v_invoice_no text;
  v_item jsonb;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_payment text;
  v_paid numeric(12,2);
  v_created_at timestamptz;
begin
  if jsonb_typeof(p_sale) <> 'object'
     or jsonb_typeof(p_sale->'items') <> 'array'
     or jsonb_array_length(p_sale->'items') < 1 then
    raise exception 'Invalid POS invoice payload';
  end if;

  begin
    v_request_key := (p_sale->>'request_key')::uuid;
    v_stock_operation_id := (p_sale->>'stock_operation_id')::uuid;
  exception when others then
    raise exception 'Valid request and stock operation ids are required';
  end;

  v_fingerprint := md5(p_sale::text);
  perform pg_advisory_xact_lock(hashtext('td-pos-invoice:' || v_request_key::text));

  select * into v_existing
  from public.pos_sales
  where request_key = v_request_key
  for update;

  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'request_key was already used with a different invoice payload';
    end if;
    return jsonb_build_object(
      'ok', true, 'sale_id', v_existing.id, 'invoice_no', v_existing.invoice_no,
      'subtotal', v_existing.subtotal, 'discount', v_existing.discount,
      'total', v_existing.total, 'payment_method', v_existing.payment_method,
      'created_at', v_existing.created_at, 'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', i.quantity, 'price', i.unit_price) order by i.id) from public.pos_sale_items i where i.sale_id = v_existing.id), '[]'::jsonb),
      'customer_name', v_existing.customer_name,
      'customer_phone', v_existing.customer_phone,
      'customer_address', v_existing.customer_address,
      'store_name', v_existing.store_name,
      'store_phone', v_existing.store_phone,
      'store_address', v_existing.store_address,
      'already_created', true
    );
  end if;

  -- One stock operation may be linked to only one invoice, even if a caller
  -- accidentally retries it with a different request_key.
  perform 1 from public.pos_sales
  where stock_operation_id = v_stock_operation_id
  for update;
  if found then
    raise exception 'Stock operation is already linked to another POS invoice';
  end if;

  v_subtotal := round(coalesce((p_sale->>'subtotal')::numeric,0),2);
  v_discount := round(coalesce((p_sale->>'discount')::numeric,0),2);
  v_total := round(coalesce((p_sale->>'total')::numeric,0),2);
  if v_subtotal < 0 or v_discount < 0 or v_discount > v_subtotal
     or v_total <> round(v_subtotal - v_discount,2) then
    raise exception 'Invalid invoice totals';
  end if;

  v_payment := lower(trim(coalesce(p_sale->>'payment_method','cash')));
  if v_payment not in ('cash','transfer','card','other') then
    raise exception 'Invalid payment method';
  end if;
  v_paid := round(coalesce((p_sale->>'paid_amount')::numeric,v_total),2);
  if v_paid < 0 or v_paid > v_total then
    raise exception 'Invalid paid amount';
  end if;
  if abs(coalesce((select sum((value->>'line_total')::numeric) from jsonb_array_elements(p_sale->'items')),0) - v_subtotal) > 0.01 then
    raise exception 'Invoice line totals do not match subtotal';
  end if;
  v_created_at := coalesce(nullif(p_sale->>'created_at','')::timestamptz, now());

  v_sale_id := gen_random_uuid();
  v_invoice_no := 'TD-POS-' || to_char(v_created_at at time zone 'UTC','YYYYMMDD') || '-' || upper(substr(replace(v_sale_id::text,'-',''),1,8));

  insert into public.pos_sales (
    id, invoice_no, request_key, stock_operation_id, request_fingerprint,
    customer_name, customer_phone, customer_address,
    subtotal, discount, total, payment_method, paid_amount,
    store_name, store_phone, store_address, created_at
  ) values (
    v_sale_id, v_invoice_no, v_request_key, v_stock_operation_id, v_fingerprint,
    left(coalesce(p_sale->>'customer_name',''),120),
    left(coalesce(p_sale->>'customer_phone',''),40),
    left(coalesce(p_sale->>'customer_address',''),300),
    v_subtotal, v_discount, v_total, v_payment, v_paid,
    left(coalesce(nullif(p_sale->>'store_name',''),'Thier Décor'),120),
    left(coalesce(p_sale->>'store_phone',''),40),
    left(coalesce(p_sale->>'store_address',''),300),
    v_created_at
  );

  for v_item in select value from jsonb_array_elements(p_sale->'items') loop
    if coalesce(v_item->>'product_id','') !~ '^[0-9]{1,18}$'
       or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,6}$'
       or (v_item->>'quantity')::numeric <= 0
       or coalesce(v_item->>'unit_price','') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(v_item->>'unit_cost','') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(v_item->>'line_total','') !~ '^[0-9]+(\.[0-9]+)?$'
       or (v_item->>'unit_cost')::numeric < 0
       or round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric,2)
          <> round((v_item->>'line_total')::numeric,2) then
      raise exception 'Invalid POS invoice line';
    end if;
    insert into public.pos_sale_items (
      sale_id, product_id, product_name, quantity, unit_price,
      unit_cost, line_total, is_pack, pack_snapshot
    ) values (
      v_sale_id,
      v_item->>'product_id',
      left(coalesce(v_item->>'product_name',''),180),
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'unit_cost')::numeric,
      round((v_item->>'line_total')::numeric,2),
      coalesce((v_item->>'is_pack')::boolean,false),
      coalesce(v_item->'pack_snapshot','[]'::jsonb)
    );
  end loop;

  return jsonb_build_object(
    'ok', true, 'sale_id', v_sale_id, 'invoice_no', v_invoice_no,
    'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total,
    'payment_method', v_payment, 'paid_amount', v_paid,
    'customer_name', coalesce(p_sale->>'customer_name',''),
    'customer_phone', coalesce(p_sale->>'customer_phone',''),
    'customer_address', coalesce(p_sale->>'customer_address',''),
    'store_name', coalesce(p_sale->>'store_name','Thier Décor'),
    'store_phone', coalesce(p_sale->>'store_phone',''),
    'store_address', coalesce(p_sale->>'store_address',''),
    'created_at', v_created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', i.quantity, 'price', i.unit_price) order by i.id) from public.pos_sale_items i where i.sale_id = v_sale_id), '[]'::jsonb),
    'already_created', false
  );
end;
$$;

revoke all on function public.td_pos_record_sale(jsonb) from public, anon, authenticated;
grant execute on function public.td_pos_record_sale(jsonb) to service_role;

commit;
