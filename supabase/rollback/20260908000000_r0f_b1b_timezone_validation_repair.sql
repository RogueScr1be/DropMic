-- LOCAL DEVELOPMENT ONLY. Never execute remotely.
-- Restore exact pre-repair RPC definitions, including the known one-slash limitation.
-- Function definitions only: no table, row, grant, or object removal operations.

CREATE OR REPLACE FUNCTION public.record_mic_flow_completion(p_completion_id text, p_mode text, p_topic_id text, p_selected_duration_seconds integer, p_completed_duration_seconds integer, p_timezone text, p_use_save boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  current_user_id uuid := auth.uid();
  server_completed_at timestamptz := clock_timestamp();
  existing_completion public.mic_flow_completions%rowtype;
  inserted_completion public.mic_flow_completions%rowtype;
  state_row public.mic_flow_state%rowtype;
  local_day date;
  previous_day_in_new_timezone date;
  previous_day_in_old_timezone date;
  current_day_in_old_timezone date;
  plus_active boolean;
  save_cap integer;
  next_flow integer;
  next_saves integer;
  milestone integer;
begin
  if current_user_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if p_completion_id is null or length(trim(p_completion_id)) not between 1 and 200 then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_mode is null or p_mode not in ('cold_take', 'freestyle', 'interview_basics', 'student_basics', 'challenge_response') then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_topic_id is null or length(trim(p_topic_id)) not between 1 and 200 then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_selected_duration_seconds is null or p_completed_duration_seconds is null
     or p_selected_duration_seconds not in (30, 60, 90) or p_completed_duration_seconds < 0 then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_completed_duration_seconds > p_selected_duration_seconds then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_timezone is null
     or length(trim(p_timezone)) not between 1 and 100
     or (p_timezone <> 'UTC' and p_timezone !~ '^[A-Za-z]+/[A-Za-z0-9_.+-]+$')
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- Serialize every owner transition, including first-state creation and replays.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text, 0));

  select * into existing_completion
  from public.mic_flow_completions
  where owner_id = current_user_id
    and completion_id = trim(p_completion_id);

  if found then
    if existing_completion.mode <> trim(p_mode)
       or existing_completion.topic_id <> trim(p_topic_id)
       or existing_completion.selected_duration_seconds <> p_selected_duration_seconds
       or existing_completion.completed_duration_seconds <> p_completed_duration_seconds
       or existing_completion.timezone <> trim(p_timezone) then
      return jsonb_build_object('status', 'unavailable');
    end if;

    select * into state_row
    from public.mic_flow_state
    where owner_id = current_user_id
    for update;

    if not found then
      return jsonb_build_object('status', 'unavailable');
    end if;

    select exists (
      select 1
      from public.billing_entitlements
      where owner_id = current_user_id
        and entitlement_key = 'plus'
        and (
          (status = 'active' and expires_at > server_completed_at)
          or (status = 'grace' and grace_expires_at > server_completed_at)
        )
    ) into plus_active;
    save_cap := case when plus_active then 3 else 1 end;
    if state_row.saves_available > save_cap then
      state_row.saves_available := save_cap;
      update public.mic_flow_state
      set saves_available = save_cap
      where owner_id = current_user_id;
    end if;
    return jsonb_build_object('status', 'already_credited', 'state', to_jsonb(state_row));
  end if;

  select exists (
    select 1
    from public.billing_entitlements
    where owner_id = current_user_id
      and entitlement_key = 'plus'
      and (
        (status = 'active' and expires_at > server_completed_at)
        or (status = 'grace' and grace_expires_at > server_completed_at)
      )
  ) into plus_active;
  save_cap := case when plus_active then 3 else 1 end;
  local_day := (server_completed_at at time zone p_timezone)::date;

  select * into state_row
  from public.mic_flow_state
  where owner_id = current_user_id
  for update;

  if found then
    next_saves := least(state_row.saves_available, save_cap);
    if state_row.last_completed_at is not null and state_row.timezone is not null then
      if state_row.timezone <> 'UTC'
         and (state_row.timezone !~ '^[A-Za-z]+/[A-Za-z0-9_.+-]+$'
              or not exists (select 1 from pg_catalog.pg_timezone_names where name = state_row.timezone)) then
        return jsonb_build_object('status', 'unavailable');
      end if;
      previous_day_in_new_timezone := (state_row.last_completed_at at time zone p_timezone)::date;
      previous_day_in_old_timezone := (state_row.last_completed_at at time zone state_row.timezone)::date;
      current_day_in_old_timezone := (server_completed_at at time zone state_row.timezone)::date;
      if local_day <= previous_day_in_new_timezone or current_day_in_old_timezone <= previous_day_in_old_timezone then
        if state_row.saves_available > save_cap then
          state_row.saves_available := save_cap;
          update public.mic_flow_state
          set saves_available = save_cap
          where owner_id = current_user_id;
        end if;
        return jsonb_build_object('status', 'same_day', 'state', to_jsonb(state_row));
      end if;

      if local_day = previous_day_in_new_timezone + 2 and next_saves > 0 and p_use_save is null then
        state_row.saves_available := next_saves;
        return jsonb_build_object('status', 'save_decision_required', 'state', to_jsonb(state_row));
      end if;
    end if;
  else
    insert into public.mic_flow_state (owner_id)
    values (current_user_id)
    returning * into state_row;
    next_saves := least(state_row.saves_available, save_cap);
  end if;

  if state_row.last_completed_at is null then
    next_flow := 1;
  elsif local_day = previous_day_in_new_timezone + 1 then
    next_flow := state_row.current_flow + 1;
  elsif p_use_save = true and local_day = previous_day_in_new_timezone + 2 and next_saves > 0 then
    next_flow := state_row.current_flow + 2;
    next_saves := next_saves - 1;
  else
    next_flow := 1;
  end if;

  insert into public.mic_flow_completions (
    completion_id,
    owner_id,
    mode,
    topic_id,
    selected_duration_seconds,
    completed_duration_seconds,
    completed_at,
    timezone,
    qualifying_day
  )
  values (
    trim(p_completion_id),
    current_user_id,
    trim(p_mode),
    trim(p_topic_id),
    p_selected_duration_seconds,
    p_completed_duration_seconds,
    server_completed_at,
    trim(p_timezone),
    local_day
  )
  on conflict (owner_id, completion_id) do nothing
  returning * into inserted_completion;

  if not found then
    select * into state_row
    from public.mic_flow_state
    where owner_id = current_user_id
    for update;
    state_row.saves_available := least(state_row.saves_available, save_cap);
    if exists (
      select 1
      from public.mic_flow_completions
      where owner_id = current_user_id
        and completion_id = trim(p_completion_id)
    ) then
      return jsonb_build_object('status', 'already_credited', 'state', to_jsonb(state_row));
    end if;
    return jsonb_build_object('status', 'same_day', 'state', to_jsonb(state_row));
  end if;

  milestone := floor(next_flow / 7.0)::integer;
  if milestone > state_row.last_rewarded_milestone then
    next_saves := least(save_cap, next_saves + 1);
  else
    milestone := state_row.last_rewarded_milestone;
  end if;

  update public.mic_flow_state
  set current_flow = next_flow,
      best_flow = greatest(state_row.best_flow, next_flow),
      saves_available = least(next_saves, save_cap),
      last_rewarded_milestone = milestone,
      last_qualified_day = local_day,
      last_completed_at = server_completed_at,
      timezone = trim(p_timezone)
  where owner_id = current_user_id
  returning * into state_row;

  return jsonb_build_object('status', 'credited', 'state', to_jsonb(state_row));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_mic_flow_snapshot(p_timezone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;
