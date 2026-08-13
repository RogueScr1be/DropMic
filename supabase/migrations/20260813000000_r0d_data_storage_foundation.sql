-- R0D-A: data, Storage, quota, and idempotent analysis-run foundation.
-- No provider calls or Quick Read UI are introduced by this migration.

do $$
begin
  create type public.analysis_run_status as enum (
    'requested',
    'uploading',
    'transcribing',
    'analyzing',
    'completed',
    'retry_pending',
    'failed',
    'expired'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.attempt_metrics (
  attempt_id uuid primary key references public.attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  mode text not null default 'local_take',
  selected_duration_seconds integer not null check (selected_duration_seconds in (30, 60, 90)),
  actual_duration_seconds integer not null check (actual_duration_seconds >= 0),
  word_count integer check (word_count is null or word_count >= 0),
  words_per_minute numeric(8, 3) check (words_per_minute is null or words_per_minute >= 0),
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  completed boolean not null default true,
  analysis_requested boolean not null default false,
  analysis_completed boolean not null default false,
  clarity numeric(4, 3) check (clarity is null or clarity between 0 and 1),
  structure numeric(4, 3) check (structure is null or structure between 0 and 1),
  specificity numeric(4, 3) check (specificity is null or specificity between 0 and 1),
  concision numeric(4, 3) check (concision is null or concision between 0 and 1),
  filler_word_count integer check (filler_word_count is null or filler_word_count >= 0),
  platform_class text check (platform_class is null or platform_class in ('phone', 'tablet', 'web')),
  metric_schema_version text not null default 'r0d.1',
  analysis_version text,
  derived_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(derived_metrics) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attempt_metrics_user_id_idx on public.attempt_metrics (user_id);
create index if not exists attempt_metrics_created_at_idx on public.attempt_metrics (created_at);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 1 and 200),
  status public.analysis_run_status not null default 'requested',
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  audio_object_path text not null unique,
  safe_error_code text,
  transcription_model_version text,
  feedback_model_version text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  audio_expires_at timestamptz not null,
  transcript_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audio_object_path like 'quick-read/%'),
  check (transcript_expires_at > requested_at),
  check (audio_expires_at > requested_at)
);

create index if not exists analysis_runs_owner_id_idx on public.analysis_runs (owner_id);
create index if not exists analysis_runs_status_idx on public.analysis_runs (status);
create index if not exists analysis_runs_audio_expires_at_idx on public.analysis_runs (audio_expires_at);
create index if not exists analysis_runs_transcript_expires_at_idx on public.analysis_runs (transcript_expires_at);

create table if not exists public.quick_read_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  quota_date date not null,
  consumed_count integer not null default 0 check (consumed_count between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, quota_date)
);

create or replace function public.assert_attempt_metadata_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_owner uuid;
begin
  select owner_id into attempt_owner
  from public.attempts
  where id = new.attempt_id;

  if attempt_owner is null or new.user_id <> attempt_owner then
    raise exception 'Attempt metadata owner does not match attempt owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists attempt_metrics_owner_guard on public.attempt_metrics;
create trigger attempt_metrics_owner_guard
before insert or update on public.attempt_metrics
for each row execute function public.assert_attempt_metadata_owner();

create or replace function public.assert_analysis_run_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_owner uuid;
begin
  select owner_id into attempt_owner
  from public.attempts
  where id = new.attempt_id;

  if attempt_owner is null or new.owner_id <> attempt_owner then
    raise exception 'Analysis run owner does not match attempt owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists analysis_runs_owner_guard on public.analysis_runs;
create trigger analysis_runs_owner_guard
before insert or update on public.analysis_runs
for each row execute function public.assert_analysis_run_owner();

drop trigger if exists attempt_metrics_set_updated_at on public.attempt_metrics;
create trigger attempt_metrics_set_updated_at
before update on public.attempt_metrics
for each row execute function public.set_updated_at();

drop trigger if exists analysis_runs_set_updated_at on public.analysis_runs;
create trigger analysis_runs_set_updated_at
before update on public.analysis_runs
for each row execute function public.set_updated_at();

drop trigger if exists quick_read_daily_usage_set_updated_at on public.quick_read_daily_usage;
create trigger quick_read_daily_usage_set_updated_at
before update on public.quick_read_daily_usage
for each row execute function public.set_updated_at();

alter table public.attempt_metrics enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.quick_read_daily_usage enable row level security;

revoke all on public.attempt_metrics, public.analysis_runs, public.quick_read_daily_usage from anon, public;
grant select on public.attempt_metrics, public.analysis_runs to authenticated;
revoke all on public.quick_read_daily_usage from authenticated;

drop policy if exists attempt_metrics_owner_select on public.attempt_metrics;
create policy attempt_metrics_owner_select on public.attempt_metrics
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists analysis_runs_owner_select on public.analysis_runs;
create policy analysis_runs_owner_select on public.analysis_runs
for select to authenticated using ((select auth.uid()) = owner_id);

-- Storage bucket configuration is kept private and limited to short-lived source audio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quick-read-audio',
  'quick-read-audio',
  false,
  52428800,
  array['audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/wav', 'audio/ogg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quick_read_audio_insert on storage.objects;
create policy quick_read_audio_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'quick-read-audio'
  and owner_id = (select auth.uid()::text)
  and name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\\.(m4a|mp4|webm|wav|ogg)$'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.attempts
    where id::text = (storage.foldername(name))[3]
      and owner_id = (select auth.uid())
  )
);

drop policy if exists quick_read_audio_select on storage.objects;
create policy quick_read_audio_select on storage.objects
for select to authenticated
using (
  bucket_id = 'quick-read-audio'
  and owner_id = (select auth.uid()::text)
  and name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\\.(m4a|mp4|webm|wav|ogg)$'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.attempts
    where id::text = (storage.foldername(name))[3]
      and owner_id = (select auth.uid())
  )
);

drop policy if exists quick_read_audio_delete on storage.objects;
create policy quick_read_audio_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'quick-read-audio'
  and owner_id = (select auth.uid()::text)
  and name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\\.(m4a|mp4|webm|wav|ogg)$'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.attempts
    where id::text = (storage.foldername(name))[3]
      and owner_id = (select auth.uid())
  )
);

-- Atomically creates the server-owned analysis run and consumes one UTC quota slot.
-- It is intentionally the only client-facing start boundary; upload happens afterward.
create or replace function public.request_quick_read(
  p_attempt_id uuid,
  p_idempotency_key text,
  p_audio_extension text
)
returns public.analysis_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  attempt_row public.attempts%rowtype;
  existing_run public.analysis_runs%rowtype;
  new_run public.analysis_runs%rowtype;
  quota_row public.quick_read_daily_usage%rowtype;
  normalized_extension text := lower(trim(p_audio_extension));
  quota_day date := (now() at time zone 'utc')::date;
begin
  if current_user_id is null then
    raise exception 'Authenticated user required' using errcode = '42501';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Permanent account required for Quick Read' using errcode = '42501';
  end if;

  if normalized_extension not in ('m4a', 'mp4', 'webm', 'wav', 'ogg') then
    raise exception 'Unsupported audio extension' using errcode = '22023';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  select * into attempt_row
  from public.attempts
  where id = p_attempt_id
    and owner_id = current_user_id
  for update;

  if not found then
    raise exception 'Owned completed attempt required' using errcode = '42501';
  end if;

  select * into existing_run
  from public.analysis_runs
  where idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if existing_run.attempt_id <> p_attempt_id then
      raise exception 'Idempotency key already belongs to another attempt' using errcode = '23505';
    end if;
    return existing_run;
  end if;

  select * into existing_run
  from public.analysis_runs
  where attempt_id = p_attempt_id
  for update;

  if found then
    raise exception 'Attempt already has an analysis run' using errcode = '23505';
  end if;

  insert into public.quick_read_daily_usage (user_id, quota_date)
  values (current_user_id, quota_day)
  on conflict (user_id, quota_date) do nothing;

  select * into quota_row
  from public.quick_read_daily_usage
  where user_id = current_user_id
    and quota_date = quota_day
  for update;

  if quota_row.consumed_count >= 3 then
    raise exception 'Quick Read daily quota exceeded' using errcode = 'P0001';
  end if;

  update public.quick_read_daily_usage
  set consumed_count = consumed_count + 1
  where user_id = current_user_id
    and quota_date = quota_day;

  insert into public.attempt_metrics (
    attempt_id,
    user_id,
    topic_id,
    mode,
    selected_duration_seconds,
    actual_duration_seconds,
    completed,
    analysis_requested
  )
  values (
    attempt_row.id,
    current_user_id,
    attempt_row.topic_id,
    'quick_read',
    attempt_row.selected_duration_seconds,
    attempt_row.completed_duration_seconds,
    true,
    true
  )
  on conflict (attempt_id) do update
  set analysis_requested = true;

  insert into public.analysis_runs (
    attempt_id,
    owner_id,
    idempotency_key,
    status,
    audio_object_path,
    audio_expires_at,
    transcript_expires_at
  )
  values (
    attempt_row.id,
    current_user_id,
    trim(p_idempotency_key),
    'requested',
    format('quick-read/%s/%s/source.%s', current_user_id, attempt_row.id, normalized_extension),
    now() + interval '24 hours',
    now() + interval '30 days'
  )
  returning * into new_run;

  return new_run;
end;
$$;

revoke all on function public.request_quick_read(uuid, text, text) from anon, public;
grant execute on function public.request_quick_read(uuid, text, text) to authenticated;

create or replace function public.advance_analysis_run(
  p_run_id uuid,
  p_next_status public.analysis_run_status,
  p_safe_error_code text default null
)
returns public.analysis_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  run_row public.analysis_runs%rowtype;
  updated_run public.analysis_runs%rowtype;
begin
  select * into run_row
  from public.analysis_runs
  where id = p_run_id
    and owner_id = current_user_id
  for update;

  if not found then
    raise exception 'Owned analysis run required' using errcode = '42501';
  end if;

  if not (
    (run_row.status = 'requested' and p_next_status = 'uploading')
    or (run_row.status = 'uploading' and p_next_status in ('transcribing', 'retry_pending', 'failed', 'expired'))
    or (run_row.status = 'transcribing' and p_next_status in ('analyzing', 'retry_pending', 'failed', 'expired'))
    or (run_row.status = 'analyzing' and p_next_status in ('completed', 'retry_pending', 'failed'))
    or (run_row.status = 'retry_pending' and p_next_status = 'uploading')
  ) then
    raise exception 'Invalid analysis status transition' using errcode = '22023';
  end if;

  if p_next_status = 'retry_pending' and run_row.retry_count >= 2 then
    raise exception 'Analysis retry budget exhausted' using errcode = 'P0001';
  end if;

  update public.analysis_runs
  set status = p_next_status,
      retry_count = case when p_next_status = 'retry_pending' then retry_count + 1 else retry_count end,
      safe_error_code = p_safe_error_code,
      completed_at = case when p_next_status = 'completed' then now() else completed_at end
  where id = p_run_id
  returning * into updated_run;

  return updated_run;
end;
$$;

revoke all on function public.advance_analysis_run(uuid, public.analysis_run_status, text) from anon, public;
grant execute on function public.advance_analysis_run(uuid, public.analysis_run_status, text) to authenticated;

revoke all on function public.assert_attempt_metadata_owner() from public;
revoke all on function public.assert_analysis_run_owner() from public;

-- DOWN
-- drop function if exists public.advance_analysis_run(uuid, public.analysis_run_status, text);
-- drop function if exists public.request_quick_read(uuid, text, text);
-- drop function if exists public.assert_analysis_run_owner();
-- drop function if exists public.assert_attempt_metadata_owner();
-- drop table if exists public.quick_read_daily_usage;
-- drop table if exists public.analysis_runs;
-- drop table if exists public.attempt_metrics;
-- drop type if exists public.analysis_run_status;
