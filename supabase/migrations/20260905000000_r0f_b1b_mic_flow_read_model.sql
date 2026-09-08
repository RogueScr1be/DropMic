-- R0F-B1B: server-derived, display-only Mic Flow snapshot.

create or replace function public._mic_flow_snapshot_status(
  p_last_completed_at timestamptz,
  p_stored_timezone text,
  p_requested_timezone text,
  p_server_now timestamptz,
  p_effective_saves integer
)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select case
    when (p_server_now at time zone p_requested_timezone)::date
           <= (p_last_completed_at at time zone p_requested_timezone)::date
      or (p_server_now at time zone p_stored_timezone)::date
           <= (p_last_completed_at at time zone p_stored_timezone)::date
      then 'protected_today'
    when (p_server_now at time zone p_requested_timezone)::date
           = (p_last_completed_at at time zone p_requested_timezone)::date + 1
      then 'needs_rep_today'
    when (p_server_now at time zone p_requested_timezone)::date
           = (p_last_completed_at at time zone p_requested_timezone)::date + 2
         and p_effective_saves > 0
      then 'recoverable_with_save'
    else 'reset_pending'
  end;
$$;

create or replace function public.get_mic_flow_snapshot(p_timezone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  server_now timestamptz := clock_timestamp();
  state_row public.mic_flow_state%rowtype;
  plus_active boolean;
  save_cap integer;
  effective_saves integer;
  snapshot_status text;
begin
  if current_user_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if p_timezone is null
     or length(trim(p_timezone)) not between 1 and 100
     or (p_timezone <> 'UTC' and p_timezone !~ '^[A-Za-z]+/[A-Za-z0-9_.+-]+$')
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select exists (
    select 1
    from public.billing_entitlements
    where owner_id = current_user_id
      and entitlement_key = 'plus'
      and length(trim(product_id)) > 0
      and (
        (status = 'active' and expires_at > server_now)
        or (status = 'grace' and grace_expires_at > server_now)
      )
  ) into plus_active;
  save_cap := case when plus_active then 3 else 1 end;

  select * into state_row
  from public.mic_flow_state
  where owner_id = current_user_id;

  if not found or state_row.last_completed_at is null then
    return jsonb_build_object(
      'status', 'not_started',
      'current_flow', 0,
      'best_flow', 0,
      'saves_available', save_cap,
      'last_qualified_day', null,
      'timezone', null
    );
  end if;

  if state_row.last_qualified_day is null
     or state_row.timezone is null
     or (state_row.timezone <> 'UTC'
         and (state_row.timezone !~ '^[A-Za-z]+/[A-Za-z0-9_.+-]+$'
              or not exists (select 1 from pg_catalog.pg_timezone_names where name = state_row.timezone))) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  effective_saves := least(greatest(state_row.saves_available, 0), save_cap);
  snapshot_status := public._mic_flow_snapshot_status(
    state_row.last_completed_at,
    state_row.timezone,
    p_timezone,
    server_now,
    effective_saves
  );

  return jsonb_build_object(
    'status', snapshot_status,
    'current_flow', state_row.current_flow,
    'best_flow', state_row.best_flow,
    'saves_available', effective_saves,
    'last_qualified_day', state_row.last_qualified_day,
    'timezone', state_row.timezone
  );
end;
$$;

revoke all on function public.get_mic_flow_snapshot(text) from public, anon;
grant execute on function public.get_mic_flow_snapshot(text) to authenticated;
revoke all on function public._mic_flow_snapshot_status(timestamptz, text, text, timestamptz, integer) from public, anon, authenticated;
