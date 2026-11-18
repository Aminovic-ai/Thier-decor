-- Restore storefront stock and delete one admin-selected order atomically.
-- This RPC is called only by the authenticated Cloudflare Worker using service_role.
CREATE OR REPLACE FUNCTION public.td_admin_delete_order(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  order_row public.orders%ROWTYPE;
  item jsonb;
  component jsonb;
  product_id bigint;
  item_qty bigint;
  component_id bigint;
  component_qty bigint;
  req jsonb := '{}'::jsonb;
  req_key text;
  req_qty bigint;
  current_qty integer;
BEGIN
  IF p_order_id IS NULL OR p_order_id <= 0 THEN
    RAISE EXCEPTION 'Invalid order id';
  END IF;

  -- Serialize deletion/status changes for this order.
  SELECT *
    INTO order_row
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;

  -- Delivered orders are immutable; deleting them would corrupt history.
  IF lower(trim(coalesce(order_row.status, ''))) = 'delivered' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'delivered_order');
  END IF;

  IF jsonb_typeof(order_row.items) <> 'array'
     OR jsonb_array_length(order_row.items) = 0 THEN
    RAISE EXCEPTION 'Order items are invalid; order was not deleted';
  END IF;

  -- Cancelled orders have already had stock restored by the status RPC.
  -- For every other status, rebuild the exact stock decrement performed at
  -- order creation: pack parent quantity plus each pack component quantity.
  IF lower(trim(coalesce(order_row.status, ''))) <> 'cancelled' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(order_row.items)
    LOOP
      IF coalesce(item->>'id', '') !~ '^[1-9][0-9]*$'
         OR coalesce(item->>'qty', '') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION 'Invalid order item; order was not deleted';
      END IF;

      product_id := (item->>'id')::bigint;
      item_qty := (item->>'qty')::bigint;

      req := jsonb_set(
        req,
        ARRAY[product_id::text],
        to_jsonb(coalesce((req->>product_id::text)::bigint, 0) + item_qty),
        true
      );

      IF coalesce((item->>'isPack')::boolean, false) THEN
        IF jsonb_typeof(coalesce(item->'packItems', 'null'::jsonb)) <> 'array'
           OR jsonb_array_length(item->'packItems') = 0 THEN
          RAISE EXCEPTION 'Pack components are missing; order was not deleted';
        END IF;

        FOR component IN SELECT value FROM jsonb_array_elements(item->'packItems')
        LOOP
          IF coalesce(component->>'id', '') !~ '^[1-9][0-9]*$'
             OR coalesce(component->>'qty', '') !~ '^[1-9][0-9]*$' THEN
            RAISE EXCEPTION 'Invalid pack component; order was not deleted';
          END IF;

          component_id := (component->>'id')::bigint;
          component_qty := (component->>'qty')::bigint * item_qty;
          req := jsonb_set(
            req,
            ARRAY[component_id::text],
            to_jsonb(coalesce((req->>component_id::text)::bigint, 0) + component_qty),
            true
          );
        END LOOP;
      END IF;
    END LOOP;

    -- Lock and validate every affected product in deterministic order before
    -- changing any quantity. This is atomic with deleting the order.
    FOR req_key, req_qty IN
      SELECT key, value::bigint
        FROM jsonb_each_text(req)
       ORDER BY key::bigint
    LOOP
      SELECT qty INTO current_qty
        FROM public.products
       WHERE id = req_key::bigint
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % is missing; order was not deleted', req_key;
      END IF;

      IF req_qty <= 0 OR req_qty > 2147483647
         OR current_qty::bigint + req_qty > 2147483647 THEN
        RAISE EXCEPTION 'Invalid stock restoration for product %', req_key;
      END IF;
    END LOOP;

    FOR req_key, req_qty IN
      SELECT key, value::bigint
        FROM jsonb_each_text(req)
       ORDER BY key::bigint
    LOOP
      UPDATE public.products
         SET qty = qty + req_qty::integer
       WHERE id = req_key::bigint;
    END LOOP;
  END IF;

  -- Remove the promotion-use ledger row only for this order.
  DELETE FROM public.td_promo_uses WHERE order_id = p_order_id::text;
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'stock_restored', lower(trim(coalesce(order_row.status, ''))) <> 'cancelled'
  );
END;
$function$;

-- SECURITY DEFINER must not be callable by public client roles.
REVOKE ALL ON FUNCTION public.td_admin_delete_order(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.td_admin_delete_order(bigint) FROM anon;
REVOKE ALL ON FUNCTION public.td_admin_delete_order(bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.td_admin_delete_order(bigint) TO service_role;
