-- Thier Décor: customer address + atomic order status + loyalty points
-- REVIEW ONLY: inspect before manually running in Supabase SQL Editor.
-- This script does not delete or rewrite existing customer/order/product rows.
alter table public.customers add column if not exists address text;

create table if not exists public.td_loyalty_awards (
  order_id bigint primary key references public.orders(id) on delete restrict,
  customer_id bigint not null references public.customers(id) on delete restrict,
  points integer not null check(points > 0),
  awarded_at timestamptz not null default now()
);
alter table public.td_loyalty_awards enable row level security;
revoke all on public.td_loyalty_awards from anon, authenticated;

create or replace function public.td_admin_update_order_status(p_order_id bigint,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 o public.orders%rowtype; it jsonb; comp jsonb; pid bigint; q integer;
 cid bigint; cq integer; req jsonb:='{}'::jsonb; k text; n numeric; awarded integer:=0;
begin
 if p_status not in ('new','confirmed','on_the_way','out_for_delivery','delivered','cancelled') then raise exception 'Invalid order status'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status=p_status then return jsonb_build_object('ok',true,'order_id',o.id,'status',o.status,'points_awarded',0); end if;
 if p_status='cancelled' and o.status<>'cancelled' then
  for it in select value from jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) loop
   pid:=(it->>'id')::bigint; q:=(it->>'qty')::integer;
   req:=jsonb_set(req,array[pid::text],to_jsonb(coalesce((req->>pid::text)::numeric,0)+q),true);
   if coalesce((it->>'isPack')::boolean,false) and jsonb_typeof(coalesce(it->'packItems','[]'::jsonb))='array' then
    for comp in select value from jsonb_array_elements(it->'packItems') loop
     cid:=(comp->>'id')::bigint; cq:=(comp->>'qty')::integer;
     req:=jsonb_set(req,array[cid::text],to_jsonb(coalesce((req->>cid::text)::numeric,0)+(cq*q)),true);
    end loop;
   end if;
  end loop;
  for k,n in select key,value::numeric from jsonb_each_text(req) order by key::bigint loop
   update public.products set qty=qty+n::integer where id=k::bigint;
   if not found then raise exception 'Missing stock product %',k; end if;
  end loop;
 end if;
 update public.orders set status=p_status where id=p_order_id returning * into o;
 if p_status='delivered' and coalesce(o.total,0)>10000 and o."customerId" is not null then
  insert into public.td_loyalty_awards(order_id,customer_id,points) values(o.id,o."customerId",40) on conflict(order_id) do nothing;
  if found then update public.customers set points=coalesce(points,0)+40 where id=o."customerId"; awarded:=40; end if;
 end if;
 return jsonb_build_object('ok',true,'order_id',o.id,'status',o.status,'points_awarded',awarded);
end; $$;
revoke all on function public.td_admin_update_order_status(bigint,text) from public;
grant execute on function public.td_admin_update_order_status(bigint,text) to service_role;
