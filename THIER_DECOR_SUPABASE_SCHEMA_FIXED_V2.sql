-- THIER DECOR STORE — SUPABASE SETUP CORRECTED V3
-- Aligned with app.js and analytics-notifications.js in Thier_Decor_Complete_Corrected_v8.zip
-- Existing business rows are not deleted. Run in Supabase SQL Editor.
-- IMPORTANT: This does not make the current Firebase + anon-key direct CRUD architecture secure.
-- Do not expose the Supabase service_role key in the browser. Review RLS/security separately.

begin;
create extension if not exists pgcrypto;

-- 1) Tables (CREATE IF NOT EXISTS preserves existing tables/rows)
create table if not exists public.products (
 id bigint primary key, name text not null, price numeric(12,2) not null default 0,
 cost numeric(12,2) not null default 0, qty integer not null default 0, category text, "desc" text,
 images jsonb not null default '[]'::jsonb, "isPack" boolean not null default false,
 "packItems" jsonb not null default '[]'::jsonb, "isSpecial" boolean not null default false,
 "promoPrice" numeric(12,2), "promoStart" date, "promoEnd" date,
 reviews jsonb not null default '[]'::jsonb, "createdAt" timestamptz not null default now()
);
create table if not exists public.customers (
 id bigint primary key, name text, phone text, password text,
 "isVip" boolean not null default false, "isTop" boolean not null default false,
 "isBlocked" boolean not null default false, points integer not null default 0,
 "recoveryPin" text, wishlist jsonb not null default '[]'::jsonb,
 "createdAt" timestamptz not null default now()
);
create table if not exists public.orders (
 id bigint primary key, "customerId" bigint, "customerName" text, "customerPhone" text,
 items jsonb not null default '[]'::jsonb, "itemsTotal" numeric(12,2) not null default 0,
 discount numeric(12,2) not null default 0, "couponCode" text, "promoCode" text,
 "promoDiscountPercent" numeric(5,2) not null default 0,
 "promoDiscountAmount" numeric(12,2) not null default 0,
 "deliveryPrice" numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 courier text, "deliveryType" text, wilaya text, commune text, address text,
 "stationCode" text, "stationName" text, "stationAddress" text,
 status text not null default 'new', "createdAt" timestamptz not null default now(),
 "paidAmount" numeric(12,2), "trackingNumber" text, weight text, "phone2" text
);
create table if not exists public.settings (
 id integer primary key default 1, "shopName" text default 'Thier Décor', "shopPhone" text default '',
 "shopAddress" text default '', "logoUrl" text, "promoText" text default '',
 "promoActive" boolean default false, "adActive" boolean default false,
 "adImages" jsonb default '[]'::jsonb, "adText" text default '', "adEndTime" text default '',
 "customPrices" jsonb default '{}'::jsonb, "manualSalesAdjustment" numeric(12,2) default 0,
 coupons jsonb default '[]'::jsonb, constraint settings_single_row check (id = 1)
);
create table if not exists public.messages (
 id bigint primary key, "customerId" bigint, name text, phone text, text text,
 date timestamptz default now(), reply text, "repliedAt" timestamptz, "replyDate" timestamptz
);
create table if not exists public.requests (
 id bigint primary key, "customerId" bigint, "customerName" text, "customerPhone" text,
 "productName" text, qty integer default 1, details text, date timestamptz default now(),
 status text default 'pending', "isTopCustomer" boolean default false
);
create table if not exists public.expenses (id bigint primary key, title text, amount numeric(12,2), date date);
create table if not exists public.td_promo_uses (
 id bigint generated always as identity primary key, promo_code text not null,
 customer_phone text not null, order_id text not null unique, used_at timestamptz not null default now()
);
create table if not exists public.td_visit_events (
 id bigint generated always as identity primary key, visited_at timestamptz not null default now(),
 page_path text not null default '/'
);
create table if not exists public.td_delivery_defaults (
 code integer primary key, name text not null, yalidine_home integer not null default 800,
 yalidine_desk integer not null default 400, noest_home integer not null default 800,
 noest_desk integer not null default 500
);

-- 2) Add columns used by this app to pre-existing tables
alter table public.products add column if not exists name text;
alter table public.products add column if not exists price numeric(12,2) not null default 0;
alter table public.products add column if not exists cost numeric(12,2) not null default 0;
alter table public.products add column if not exists qty integer not null default 0;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists "desc" text;
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists "isPack" boolean not null default false;
alter table public.products add column if not exists "packItems" jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists "isSpecial" boolean not null default false;
alter table public.products add column if not exists "promoPrice" numeric(12,2);
alter table public.products add column if not exists "promoStart" date;
alter table public.products add column if not exists "promoEnd" date;
alter table public.products add column if not exists reviews jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists "createdAt" timestamptz not null default now();

alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists password text;
alter table public.customers add column if not exists "isVip" boolean not null default false;
alter table public.customers add column if not exists "isTop" boolean not null default false;
alter table public.customers add column if not exists "isBlocked" boolean not null default false;
alter table public.customers add column if not exists points integer not null default 0;
alter table public.customers add column if not exists "recoveryPin" text;
alter table public.customers add column if not exists wishlist jsonb not null default '[]'::jsonb;
alter table public.customers add column if not exists "createdAt" timestamptz not null default now();

alter table public.orders add column if not exists "customerId" bigint;
alter table public.orders add column if not exists "customerName" text;
alter table public.orders add column if not exists "customerPhone" text;
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists "itemsTotal" numeric(12,2) not null default 0;
alter table public.orders add column if not exists discount numeric(12,2) not null default 0;
alter table public.orders add column if not exists "couponCode" text;
alter table public.orders add column if not exists "promoCode" text;
alter table public.orders add column if not exists "promoDiscountPercent" numeric(5,2) not null default 0;
alter table public.orders add column if not exists "promoDiscountAmount" numeric(12,2) not null default 0;
alter table public.orders add column if not exists "deliveryPrice" numeric(12,2) not null default 0;
alter table public.orders add column if not exists total numeric(12,2) not null default 0;
alter table public.orders add column if not exists courier text;
alter table public.orders add column if not exists "deliveryType" text;
alter table public.orders add column if not exists wilaya text;
alter table public.orders add column if not exists commune text;
alter table public.orders add column if not exists address text;
alter table public.orders add column if not exists "stationCode" text;
alter table public.orders add column if not exists "stationName" text;
alter table public.orders add column if not exists "stationAddress" text;
alter table public.orders add column if not exists status text not null default 'new';
alter table public.orders add column if not exists "createdAt" timestamptz not null default now();
alter table public.orders add column if not exists "paidAmount" numeric(12,2);
alter table public.orders add column if not exists "trackingNumber" text;
alter table public.orders add column if not exists weight text;
alter table public.orders add column if not exists phone2 text;

alter table public.settings add column if not exists "shopName" text default 'Thier Décor';
alter table public.settings add column if not exists "shopPhone" text default '';
alter table public.settings add column if not exists "shopAddress" text default '';
alter table public.settings add column if not exists "logoUrl" text;
alter table public.settings add column if not exists "promoText" text default '';
alter table public.settings add column if not exists "promoActive" boolean default false;
alter table public.settings add column if not exists "adActive" boolean default false;
alter table public.settings add column if not exists "adImages" jsonb default '[]'::jsonb;
alter table public.settings add column if not exists "adText" text default '';
alter table public.settings add column if not exists "adEndTime" text default '';
alter table public.settings add column if not exists "customPrices" jsonb default '{}'::jsonb;
alter table public.settings add column if not exists "manualSalesAdjustment" numeric(12,2) default 0;
alter table public.settings add column if not exists coupons jsonb default '[]'::jsonb;
alter table public.messages add column if not exists "customerId" bigint;
alter table public.messages add column if not exists name text;
alter table public.messages add column if not exists phone text;
alter table public.messages add column if not exists text text;
alter table public.messages add column if not exists date timestamptz default now();
alter table public.messages add column if not exists reply text;
alter table public.messages add column if not exists "repliedAt" timestamptz;
alter table public.messages add column if not exists "replyDate" timestamptz;
alter table public.requests add column if not exists "customerId" bigint;
alter table public.requests add column if not exists "customerName" text;
alter table public.requests add column if not exists "customerPhone" text;
alter table public.requests add column if not exists "productName" text;
alter table public.requests add column if not exists qty integer default 1;
alter table public.requests add column if not exists details text;
alter table public.requests add column if not exists date timestamptz default now();
alter table public.requests add column if not exists status text default 'pending';
alter table public.requests add column if not exists "isTopCustomer" boolean default false;
alter table public.expenses add column if not exists title text;
alter table public.expenses add column if not exists amount numeric(12,2);
alter table public.expenses add column if not exists date date;

-- IDs generated by Date.now() require bigint. Convert legacy integer ID columns explicitly.
-- Any dependency error is re-raised with the exact table/column; the transaction then rolls back safely.
do $$
declare r record;
begin
 for r in
   select table_name, column_name
   from information_schema.columns
   where table_schema='public' and data_type='integer'
     and column_name in ('id','customerId')
     and table_name in ('products','customers','orders','messages','requests','expenses')
 loop
   begin
     execute format('alter table public.%I alter column %I type bigint using %I::bigint', r.table_name, r.column_name, r.column_name);
   exception when others then
     raise exception 'Cannot convert public.%.% from integer to bigint: %. No changes were committed; inspect dependent views/rules/foreign keys, then rerun.', r.table_name, r.column_name, SQLERRM;
   end;
 end loop;
end $$;

create index if not exists products_created_idx on public.products("createdAt" desc);
create index if not exists products_category_idx on public.products(category);
create index if not exists customers_phone_idx on public.customers(phone);
create index if not exists orders_phone_idx on public.orders("customerPhone");
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_idx on public.orders("createdAt" desc);
create index if not exists messages_customer_idx on public.messages("customerId");
create index if not exists requests_phone_idx on public.requests("customerPhone");
create index if not exists td_promo_uses_code_phone_idx on public.td_promo_uses(upper(promo_code), customer_phone);

insert into public.settings(id) values (1) on conflict(id) do nothing;

-- Add the singleton constraint to older installations too, without swallowing errors.
do $$
begin
 if not exists (
   select 1 from pg_constraint
   where conrelid='public.settings'::regclass and conname='settings_single_row'
 ) then
   if exists (select 1 from public.settings where id is distinct from 1) then
     raise exception 'Cannot add settings_single_row: public.settings contains rows whose id is not 1. Review these rows before rerunning.';
   end if;
   alter table public.settings add constraint settings_single_row check (id = 1);
 end if;
end $$;
insert into public.td_delivery_defaults(code,name,yalidine_home,yalidine_desk,noest_home,noest_desk) values
(1,'01 - Adrar',1000,600,1500,1000),(2,'02 - Chlef',800,400,800,500),(3,'03 - Laghouat',800,400,1000,600),(4,'04 - Oum El Bouaghi',800,400,800,500),(5,'05 - Batna',800,400,800,500),(6,'06 - Bejaia',800,400,800,500),(7,'07 - Biskra',800,400,1000,600),(8,'08 - Bechar',1000,600,1200,800),(9,'09 - Blida',600,300,600,400),(10,'10 - Bouira',700,350,500,300),(11,'11 - Tamanrasset',1200,700,2000,1500),(12,'12 - Tebessa',800,400,900,600),(13,'13 - Tlemcen',800,400,800,500),(14,'14 - Tiaret',800,400,900,600),(15,'15 - Tizi Ouzou',750,350,700,450),(16,'16 - Alger',600,300,650,400),(17,'17 - Djelfa',800,400,1000,600),(18,'18 - Jijel',800,400,850,500),(19,'19 - Setif',800,400,800,500),(20,'20 - Saida',800,400,900,600),(21,'21 - Skikda',800,400,800,500),(22,'22 - Sidi Bel Abbes',800,400,800,500),(23,'23 - Annaba',800,400,800,500),(24,'24 - Guelma',800,400,900,600),(25,'25 - Constantine',800,400,800,500),(26,'26 - Medea',800,400,700,450),(27,'27 - Mostaganem',800,400,800,500),(28,'28 - Msila',800,400,800,500),(29,'29 - Mascara',800,400,800,500),(30,'30 - Ouargla',1000,600,1100,700),(31,'31 - Oran',800,400,800,500),(32,'32 - El Bayadh',900,500,1200,800),(33,'33 - Illizi',1200,700,1900,1500),(34,'34 - Bordj Bou Arreridj',800,400,800,500),(35,'35 - Boumerdes',700,350,600,400),(36,'36 - El Tarf',800,400,900,600),(37,'37 - Tindouf',1300,800,1700,1000),(38,'38 - Tissemsilt',800,400,800,500),(39,'39 - El Oued',900,500,1100,700),(40,'40 - Khenchela',800,400,900,600),(41,'41 - Souk Ahras',800,400,900,600),(42,'42 - Tipaza',750,350,600,400),(43,'43 - Mila',800,400,800,500),(44,'44 - Ain Defla',800,400,800,500),(45,'45 - Naama',900,500,1200,800),(46,'46 - Ain Temouchent',800,400,800,500),(47,'47 - Ghardaia',900,500,1100,700),(48,'48 - Relizane',800,400,800,500),(49,'49 - Timimoun',1200,700,1500,1000),(50,'50 - Bordj Badji Mokhtar',1300,800,1700,1100),(51,'51 - Ouled Djellal',900,500,1000,600),(52,'52 - Beni Abbes',1200,700,1200,800),(53,'53 - In Salah',1300,800,1800,1200),(54,'54 - In Guezzam',1400,900,2200,1600),(55,'55 - Touggourt',1000,600,1100,700),(56,'56 - Djanet',1400,900,2200,1600),(57,'57 - El M''Ghair',900,500,1100,700),(58,'58 - El Meniaa',1000,600,1100,700)
on conflict(code) do nothing;

-- 3) Helper functions
create or replace function public.td_normalize_phone(p_phone text)
returns text language sql immutable parallel safe as $$ select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); $$;
revoke all on function public.td_normalize_phone(text) from public;

create or replace function public.td_compute_delivery_price(p_wilaya_code integer,p_courier text,p_delivery_type text)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c text:=lower(coalesce(p_courier,'noest')); t text:=case when lower(coalesce(p_delivery_type,'home')) in ('stopdesk','desk') then 'desk' else 'home' end; d integer; ov text;
begin
 select case when c='yalidine' and t='home' then yalidine_home when c='yalidine' and t='desk' then yalidine_desk when c='noest' and t='home' then noest_home when c='noest' and t='desk' then noest_desk else 800 end
 into d from public.td_delivery_defaults where code=p_wilaya_code;
 if d is null then d:=800; end if;
 select "customPrices" -> p_wilaya_code::text -> c ->> t into ov from public.settings where id=1;
 if ov is not null and ov ~ '^[0-9]+(\.[0-9]+)?$' and ov::numeric>=0 then return ov::numeric; end if;
 return d::numeric;
end $$;
revoke all on function public.td_compute_delivery_price(integer,text,text) from public;
grant execute on function public.td_compute_delivery_price(integer,text,text) to anon,authenticated;

create or replace function public.td_check_promo(p_code text,p_phone text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cp jsonb; used_count integer; pn text:=public.td_normalize_phone(p_phone); cn text:=upper(trim(coalesce(p_code,''))); max_uses integer; disc numeric;
begin
 if cn='' or pn='' then return jsonb_build_object('valid',false,'reason','missing'); end if;
 select elem into cp from public.settings s, lateral jsonb_array_elements(case when jsonb_typeof(coalesce(s.coupons,'[]'::jsonb))='array' then coalesce(s.coupons,'[]'::jsonb) else '[]'::jsonb end) elem
 where s.id=1 and upper(trim(coalesce(elem->>'code','')))=cn limit 1;
 if cp is null then return jsonb_build_object('valid',false,'reason','not_found'); end if;
 if lower(coalesce(cp->>'active','true')) in ('false','0','no') then return jsonb_build_object('valid',false,'reason','inactive'); end if;
 if nullif(public.td_normalize_phone(cp->>'phone'),'') is not null and public.td_normalize_phone(cp->>'phone')<>pn then return jsonb_build_object('valid',false,'reason','phone_mismatch'); end if;
 if nullif(cp->>'expiresAt','') is not null then begin if (cp->>'expiresAt')::timestamptz < now() then return jsonb_build_object('valid',false,'reason','expired'); end if; exception when others then return jsonb_build_object('valid',false,'reason','invalid_expiry'); end; end if;
 begin max_uses:=greatest(coalesce((cp->>'maxUses')::integer,1),1); exception when others then max_uses:=1; end;
 begin disc:=greatest(0,least(100,coalesce((cp->>'discount')::numeric,0))); exception when others then disc:=0; end;
 select count(*)::integer into used_count from public.td_promo_uses where upper(promo_code)=cn and customer_phone=pn;
 if used_count>=max_uses then return jsonb_build_object('valid',false,'reason','limit_reached','used',used_count,'maxUses',max_uses); end if;
 return jsonb_build_object('valid',true,'code',cn,'discount',disc,'used',used_count,'maxUses',max_uses,'remaining',greatest(max_uses-used_count,0));
end $$;

create or replace function public.td_consume_promo(p_code text,p_phone text,p_order_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare chk jsonb; pn text:=public.td_normalize_phone(p_phone); cn text:=upper(trim(coalesce(p_code,''))); owner_phone text; existing_code text; existing_phone text;
begin
 if coalesce(p_order_id,'')='' or cn='' or pn='' then return jsonb_build_object('ok',false,'reason','missing_order_or_promo'); end if;
 select public.td_normalize_phone(o."customerPhone") into owner_phone from public.orders o where o.id::text=p_order_id;
 if owner_phone is null then return jsonb_build_object('ok',false,'reason','order_not_found'); end if;
 if owner_phone<>pn then return jsonb_build_object('ok',false,'reason','order_phone_mismatch'); end if;
 -- A retry for the same order/code/phone is successful; a conflicting reuse is not.
 select upper(promo_code), customer_phone into existing_code, existing_phone
 from public.td_promo_uses where order_id=p_order_id;
 if found then
   if existing_code=cn and existing_phone=pn then return jsonb_build_object('ok',true,'already_recorded',true); end if;
   return jsonb_build_object('ok',false,'reason','order_already_has_different_promo');
 end if;
 perform pg_advisory_xact_lock(hashtext(cn||':'||pn));
 chk:=public.td_check_promo(p_code,p_phone);
 if coalesce((chk->>'valid')::boolean,false) is not true then return jsonb_build_object('ok',false,'reason',chk->>'reason'); end if;
 insert into public.td_promo_uses(promo_code,customer_phone,order_id) values(cn,pn,p_order_id);
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.td_promo_usage_stats()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_object_agg(code,uses),'{}'::jsonb) from (select upper(promo_code) code,count(*)::integer uses from public.td_promo_uses group by upper(promo_code)) q;
$$;
revoke all on function public.td_check_promo(text,text) from public;
revoke all on function public.td_consume_promo(text,text,text) from public;
revoke all on function public.td_promo_usage_stats() from public;
grant execute on function public.td_check_promo(text,text) to anon,authenticated;
grant execute on function public.td_consume_promo(text,text,text) to anon,authenticated;
grant execute on function public.td_promo_usage_stats() to anon,authenticated;

create or replace function public.td_record_visit(p_path text default '/')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ begin insert into public.td_visit_events(page_path) values(left(coalesce(nullif(p_path,''),'/'),250)); return true; end $$;
create or replace function public.td_get_visit_stats()
returns json language sql stable security definer set search_path=public,pg_temp as $$
 select json_build_object('today_visits',count(*) filter(where visited_at>=date_trunc('day',now())),'total_visits',count(*)) from public.td_visit_events;
$$;
revoke all on function public.td_record_visit(text) from public;
revoke all on function public.td_get_visit_stats() from public;
grant execute on function public.td_record_visit(text) to anon,authenticated;
grant execute on function public.td_get_visit_stats() to anon,authenticated;

-- Keep promo-use and visit raw records inaccessible via direct table API.
alter table public.td_promo_uses enable row level security;
revoke all on public.td_promo_uses from anon,authenticated;
alter table public.td_visit_events enable row level security;
revoke all on public.td_visit_events from anon,authenticated;

-- 4) Recompute order price fields from current database product prices on INSERT.
-- Uses product price/promo rules from effectiveProductPrice() in app.js.
-- Coupon discount is applied only when code + phone match a currently valid coupon.
-- This trigger protects totals from simple client price edits, but does NOT atomically reserve stock.
create or replace function public.td_orders_recalculate_prices()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 it jsonb; comp jsonb; pid bigint; q numeric; p record; line_total numeric; subtotal numeric:=0;
 pct numeric:=0; disc numeric:=0; dprice numeric:=0; code text; cp jsonb; phone_norm text;
 expiry timestamptz; component_id bigint; component_qty numeric;
 v_wilaya_code integer:=0; v_required jsonb:='{}'::jsonb; req_key text; req_qty numeric; stock_qty numeric;
begin
 if jsonb_typeof(coalesce(new.items,'[]'::jsonb))<>'array' then
   raise exception 'Order items must be a JSON array';
 end if;
 if jsonb_array_length(coalesce(new.items,'[]'::jsonb))=0 then
   raise exception 'Order items must not be empty';
 end if;
 for it in select value from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) loop
   begin pid:=(it->>'id')::bigint; q:=(it->>'qty')::numeric;
   exception when others then raise exception 'Invalid product id or quantity in order'; end;
   if pid is null or q is null or q<=0 or q<>trunc(q) then raise exception 'Invalid quantity for product %',pid; end if;
   select pr.id,pr.name,pr.price,pr.qty,pr."isPack",pr."packItems",pr."promoPrice",pr."promoStart",pr."promoEnd"
     into p from public.products pr where pr.id=pid;
   if not found then raise exception 'Product % no longer exists',pid; end if;

   -- Aggregate requirements by product ID so duplicate item rows cannot bypass stock checks.
   v_required:=jsonb_set(v_required,array[pid::text],
     to_jsonb(coalesce((v_required->>pid::text)::numeric,0)+q),true);

   if p."promoPrice" is not null and p."promoPrice">0 and p."promoPrice"<p.price
      and (p."promoStart" is null or p."promoStart"<=current_date)
      and (p."promoEnd" is null or p."promoEnd">=current_date) then
     line_total:=p."promoPrice";
   else line_total:=p.price; end if;
   subtotal:=subtotal+(line_total*q);

   -- Aggregate pack-component requirements too, including repeated components across packs.
   if coalesce(p."isPack",false) and jsonb_typeof(coalesce(p."packItems",'[]'::jsonb))='array' then
     for comp in select value from jsonb_array_elements(coalesce(p."packItems",'[]'::jsonb)) loop
       begin component_id:=(comp->>'id')::bigint; component_qty:=(comp->>'qty')::numeric;
       exception when others then raise exception 'Invalid pack component in product %',pid; end;
       if component_id is null or component_qty is null or component_qty<=0 or component_qty<>trunc(component_qty) then
         raise exception 'Invalid pack component quantity in product %',pid;
       end if;
       v_required:=jsonb_set(v_required,array[component_id::text],
         to_jsonb(coalesce((v_required->>component_id::text)::numeric,0)+(component_qty*q)),true);
     end loop;
   end if;
 end loop;

 -- Check the complete combined requirement only after all item and pack rows have been collected.
 for req_key,req_qty in select key,value::numeric from jsonb_each_text(v_required) loop
   select pr.qty into stock_qty from public.products pr where pr.id=req_key::bigint;
   if not found then raise exception 'Required stock product % does not exist',req_key; end if;
   if stock_qty < req_qty then raise exception 'Insufficient stock for product % (required %, available %)',req_key,req_qty,stock_qty; end if;
 end loop;

 code:=upper(trim(coalesce(nullif(new."promoCode",''),new."couponCode",'')));
 if code<>'' then
   phone_norm:=public.td_normalize_phone(new."customerPhone");
   select elem into cp from public.settings s,
     lateral jsonb_array_elements(case when jsonb_typeof(coalesce(s.coupons,'[]'::jsonb))='array' then coalesce(s.coupons,'[]'::jsonb) else '[]'::jsonb end) elem
   where s.id=1 and upper(trim(coalesce(elem->>'code','')))=code limit 1;
   if cp is not null
      and (nullif(public.td_normalize_phone(cp->>'phone'),'') is null or public.td_normalize_phone(cp->>'phone')=phone_norm)
      and lower(coalesce(cp->>'active','true')) not in ('false','0','no') then
     expiry:=null;
     if nullif(cp->>'expiresAt','') is not null then
       begin expiry:=(cp->>'expiresAt')::timestamptz;
       exception when others then expiry:=now()-interval '1 second'; end;
     end if;
     if expiry is null or expiry>=now() then
       begin pct:=greatest(0,least(100,(cp->>'discount')::numeric));
       exception when others then pct:=0; end;
     end if;
   end if;
 end if;
 disc:=round(subtotal*pct/100,2);
 -- Accept only a leading numeric wilaya code; malformed values use code 0 instead of crashing on ::integer.
 if coalesce(new.wilaya,'') ~ '^[0-9]{1,2}' then
   v_wilaya_code:=substring(new.wilaya from '^([0-9]{1,2})')::integer;
 end if;
 dprice:=public.td_compute_delivery_price(v_wilaya_code,new.courier,new."deliveryType");
 new."itemsTotal":=subtotal;
 new.discount:=disc;
 new."promoDiscountPercent":=pct;
 new."promoDiscountAmount":=disc;
 new."deliveryPrice":=dprice;
 new.total:=greatest(0,subtotal-disc)+dprice;
 return new;
end $$;
drop trigger if exists td_orders_recalculate_prices_before_insert on public.orders;
drop trigger if exists trg_validate_order_insert on public.orders;
drop trigger if exists td_validate_order_insert on public.orders;
create trigger td_orders_recalculate_prices_before_insert before insert on public.orders for each row execute function public.td_orders_recalculate_prices();


-- 5) Atomic order creation: lock all required stock rows, insert order, consume coupon,
-- then deduct product and pack-component quantities in the same database transaction.
-- This RPC reduces the concurrent-stock race for the customer checkout path. It does NOT
-- replace Firebase identity verification / RLS for production administration.
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
begin
  if jsonb_typeof(p_order) <> 'object' then raise exception 'Order payload must be a JSON object'; end if;
  if nullif(p_order->>'id','') is null or nullif(p_order->>'customerPhone','') is null then
    raise exception 'Order id and customer phone are required';
  end if;
  if jsonb_typeof(coalesce(p_order->'items','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_order->'items','[]'::jsonb)) = 0 then
    raise exception 'Order items must be a non-empty JSON array';
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
  return jsonb_build_object('ok',true,'order_id',inserted_id);
end;
$$;
revoke all on function public.td_create_order(jsonb) from public;
grant execute on function public.td_create_order(jsonb) to anon, authenticated;

-- 5) Basic verification queries (results appear after this script is run)
select 'tables' as check_name, count(*) as result from information_schema.tables where table_schema='public' and table_name in ('products','customers','orders','settings','messages','requests','expenses','td_promo_uses','td_visit_events','td_delivery_defaults');
select 'delivery_wilayas' as check_name, count(*) as result from public.td_delivery_defaults;
do $$
begin
 if (select count(*) from public.td_delivery_defaults) < 58 then
   raise exception 'Verification failed: td_delivery_defaults must contain all 58 wilayas.';
 end if;
 if to_regprocedure('public.td_check_promo(text,text)') is null
    or to_regprocedure('public.td_consume_promo(text,text,text)') is null
    or to_regprocedure('public.td_promo_usage_stats()') is null
    or to_regprocedure('public.td_record_visit(text)') is null
    or to_regprocedure('public.td_get_visit_stats()') is null
    or to_regprocedure('public.td_orders_recalculate_prices()') is null
    or to_regprocedure('public.td_create_order(jsonb)') is null then
   raise exception 'Verification failed: one or more required RPC/trigger functions are missing.';
 end if;
 if not exists (select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='td_orders_recalculate_prices_before_insert' and not tgisinternal) then
   raise exception 'Verification failed: order validation trigger is missing.';
 end if;
end $$;
select 'tables' as check_name, count(*) as result from information_schema.tables where table_schema='public' and table_name in ('products','customers','orders','settings','messages','requests','expenses','td_promo_uses','td_visit_events','td_delivery_defaults');
select 'delivery_wilayas' as check_name, count(*) as result from public.td_delivery_defaults;
select 'required_functions' as check_name, count(*) as result from information_schema.routines where routine_schema='public' and routine_name in ('td_normalize_phone','td_compute_delivery_price','td_check_promo','td_consume_promo','td_promo_usage_stats','td_record_visit','td_get_visit_stats','td_orders_recalculate_prices','td_create_order');
commit;

-- SECURITY WARNING:
-- The existing app.js uses the public/anon Supabase client for direct reads and writes,
-- including admin actions, while admin sign-in is Firebase. SQL alone cannot securely
-- distinguish a Firebase admin from a public visitor. Do not claim admin data is protected
-- until RLS policies or a server-side API validating Firebase identity have been implemented.
-- The trigger validates current product/pack stock and recalculates prices, but actual stock decrements
-- still happen in multiple client-side requests; concurrent orders can still race. Atomic reservation
-- requires changing app.js to call one server-side transactional order RPC/Edge Function.
-- td_promo_usage_stats is executable by anon because this app uses Firebase (not Supabase Auth)
-- for its admin UI; this exposes aggregate coupon-use counts. For production, move admin stats to a
-- server-side endpoint that verifies Firebase admin identity, then revoke anon execution.
