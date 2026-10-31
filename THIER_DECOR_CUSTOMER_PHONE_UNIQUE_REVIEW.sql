-- Thier Decor: canonical Algerian phone uniqueness + server-side lookup
-- REVIEW ONLY. Apply only after reviewing existing duplicate phone records.
-- Run after THIER_DECOR_SUPABASE_SCHEMA_FIXED_V2.sql.
-- This migration does not delete, merge, or rewrite customer rows.

begin;

create or replace function public.td_customer_phone_key(p_phone text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  n text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if n like '00213%' then
    n := substr(n, 6);
  elsif n like '213%' then
    n := substr(n, 4);
  end if;

  if n like '0%' then
    n := substr(n, 2);
  end if;

  return n;
end;
$$;

revoke all on function public.td_customer_phone_key(text) from public;

-- Stop before creating the unique index if legacy accounts already share a
-- canonical phone number. No customer data is changed by this check.
do $$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count
  from (
    select public.td_customer_phone_key(phone) as phone_key
    from public.customers
    where nullif(public.td_customer_phone_key(phone), '') is not null
    group by public.td_customer_phone_key(phone)
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'Phone uniqueness migration stopped: % duplicate canonical phone group(s) exist. Review them manually; this script will not delete or merge customers.',
      duplicate_count;
  end if;
end;
$$;

create unique index if not exists customers_phone_canonical_uidx
  on public.customers (public.td_customer_phone_key(phone))
  where phone is not null
    and public.td_customer_phone_key(phone) <> '';

-- The Worker calls this function using service_role only. Returning the row
-- to the Worker is necessary for password verification; secrets never go to
-- the browser because safeCustomer() removes password and recoveryPin.
create or replace function public.td_find_customer_by_phone(p_phone text)
returns setof public.customers
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.*
  from public.customers c
  where public.td_customer_phone_key(c.phone) =
        public.td_customer_phone_key(p_phone)
    and public.td_customer_phone_key(p_phone) <> ''
  limit 1;
$$;

revoke all on function public.td_find_customer_by_phone(text)
  from public, anon, authenticated;
grant execute on function public.td_find_customer_by_phone(text)
  to service_role;

-- Read-only structural checks; no customer rows are modified.
do $$
begin
  if to_regprocedure('public.td_customer_phone_key(text)') is null then
    raise exception 'td_customer_phone_key(text) was not created';
  end if;
  if to_regprocedure('public.td_find_customer_by_phone(text)') is null then
    raise exception 'td_find_customer_by_phone(text) was not created';
  end if;
  if to_regclass('public.customers_phone_canonical_uidx') is null then
    raise exception 'customers_phone_canonical_uidx was not created';
  end if;
end;
$$;

commit;
