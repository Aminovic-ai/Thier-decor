-- Thier Décor: privacy-minimised visit counters.
-- Run this script in Supabase SQL Editor. It records one visit per browser tab session.
create table if not exists public.td_visit_events (
  id bigint generated always as identity primary key,
  visited_at timestamptz not null default now(),
  page_path text not null default '/'
);

alter table public.td_visit_events enable row level security;
revoke all on public.td_visit_events from anon, authenticated;
-- No direct SELECT is granted to visitors. The public client can only call the restricted RPC below.
grant insert on public.td_visit_events to anon, authenticated;

create or replace function public.td_record_visit(p_path text default '/')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.td_visit_events(page_path)
  values (left(coalesce(nullif(p_path, ''), '/'), 250));
  return true;
end;
$$;

create or replace function public.td_get_visit_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'today_visits', count(*) filter (where visited_at >= date_trunc('day', now())),
    'total_visits', count(*)
  )
  from public.td_visit_events;
$$;

revoke all on function public.td_record_visit(text) from public;
revoke all on function public.td_get_visit_stats() from public;
grant execute on function public.td_record_visit(text) to anon, authenticated;
grant execute on function public.td_get_visit_stats() to anon, authenticated;
