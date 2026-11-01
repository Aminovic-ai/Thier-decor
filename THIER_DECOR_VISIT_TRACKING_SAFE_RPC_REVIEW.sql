-- Thier Décor: safe visit tracking RPC for the Cloudflare Worker.
-- Review only: do not run until the existing td_visit_events schema is checked.
-- The Worker calls:
--   rpc/td_record_visit_safe
--   { p_path, p_session_key, p_ip_hash }
--
-- Existing visit rows are preserved. New nullable columns are added in-place.

alter table public.td_visit_events
  add column if not exists session_key text,
  add column if not exists ip_hash text;

-- Keep one event per browser session. Existing rows with NULL session_key remain intact.
create unique index if not exists td_visit_events_session_key_uidx
  on public.td_visit_events (session_key)
  where session_key is not null;

create or replace function public.td_record_visit_safe(
  p_ip_hash text,
  p_path text,
  p_session_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id bigint;
  safe_path text;
begin
  if p_session_key is null
     or length(p_session_key) < 24
     or length(p_session_key) > 80
     or p_session_key !~ '^[a-fA-F0-9-]+$' then
    raise exception 'Invalid visit session key';
  end if;

  if p_ip_hash is null
     or length(p_ip_hash) <> 64
     or p_ip_hash !~ '^[a-fA-F0-9]+$' then
    raise exception 'Invalid visit IP hash';
  end if;

  safe_path := left(coalesce(nullif(p_path, ''), '/'), 240);

  insert into public.td_visit_events (page_path, session_key, ip_hash)
  values (safe_path, p_session_key, lower(p_ip_hash))
  on conflict (session_key) where session_key is not null
  do nothing
  returning id into inserted_id;

  return jsonb_build_object('recorded', inserted_id is not null);
end;
$$;

revoke all on function public.td_record_visit_safe(text, text, text) from public;
revoke all on function public.td_record_visit_safe(text, text, text) from anon;
revoke all on function public.td_record_visit_safe(text, text, text) from authenticated;
grant execute on function public.td_record_visit_safe(text, text, text) to service_role;
