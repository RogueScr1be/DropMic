-- R0F-B1A: server-authoritative Mic Flow completion and state.

create table if not exists public.mic_flow_completions (
  completion_id text primary key check (length(trim(completion_id)) between 1 and 200),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('cold_take', 'freestyle', 'interview_basics', 'student_basics', 'challenge_response')),
  topic_id text not null check (length(trim(topic_id)) between 1 and 200),
  selected_duration_seconds integer not null check (selected_duration_seconds in (30, 60, 90)),
  completed_duration_seconds integer not null check (completed_duration_seconds >= 0),
  completed_at timestamptz not null,
  timezone text not null check (length(trim(timezone)) between 1 and 100),
  qualifying_day date not null,
  created_at timestamptz not null default now(),
  unique (owner_id, qualifying_day)
);

create index if not exists mic_flow_completions_owner_day_idx
  on public.mic_flow_completions (owner_id, qualifying_day desc);

create table if not exists public.mic_flow_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  current_flow integer not null default 0 check (current_flow >= 0),
  best_flow integer not null default 0 check (best_flow >= current_flow),
  saves_available integer not null default 1 check (saves_available between 0 and 3),
  last_rewarded_milestone integer not null default 0 check (last_rewarded_milestone >= 0),
  last_qualified_day date,
  last_completed_at timestamptz,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists mic_flow_state_set_updated_at on public.mic_flow_state;
create trigger mic_flow_state_set_updated_at
before update on public.mic_flow_state
for each row execute function public.set_updated_at();

alter table public.mic_flow_completions enable row level security;
alter table public.mic_flow_state enable row level security;

revoke all on public.mic_flow_completions, public.mic_flow_state from anon, public, authenticated;
grant select on public.mic_flow_completions, public.mic_flow_state to authenticated;

drop policy if exists mic_flow_completions_owner_select on public.mic_flow_completions;
create policy mic_flow_completions_owner_select on public.mic_flow_completions
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists mic_flow_state_owner_select on public.mic_flow_state;
create policy mic_flow_state_owner_select on public.mic_flow_state
for select to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.record_mic_flow_completion(
  p_completion_id text,
  p_mode text,
  p_topic_id text,
  p_selected_duration_seconds integer,
  p_completed_duration_seconds integer,
  p_timezone text,
  p_use_save boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  where completion_id = trim(p_completion_id);

  if found then
    if existing_completion.owner_id <> current_user_id then
      return jsonb_build_object('status', 'unavailable');
    end if;
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
  on conflict do nothing
  returning * into inserted_completion;

  if not found then
    select * into state_row
    from public.mic_flow_state
    where owner_id = current_user_id
    for update;
    state_row.saves_available := least(state_row.saves_available, save_cap);
    if exists (select 1 from public.mic_flow_completions where completion_id = trim(p_completion_id) and owner_id = current_user_id) then
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
$$;

revoke all on function public.record_mic_flow_completion(text, text, text, integer, integer, text, boolean) from public, anon;
grant execute on function public.record_mic_flow_completion(text, text, text, integer, integer, text, boolean) to authenticated;

-- DOWN
-- revoke all on function public.record_mic_flow_completion(text, text, text, integer, integer, text, boolean) from authenticated;
-- drop function if exists public.record_mic_flow_completion(text, text, text, integer, integer, text, boolean);
-- drop table if exists public.mic_flow_state;
-- drop table if exists public.mic_flow_completions;
