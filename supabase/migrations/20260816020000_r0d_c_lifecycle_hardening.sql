-- R0D-C: lifecycle hardening, cleanup observability, and protected provider-test hooks.

alter table public.analysis_runs
  add column if not exists transcription_attempt_count integer not null default 0
    check (transcription_attempt_count >= 0),
  add column if not exists feedback_attempt_count integer not null default 0
    check (feedback_attempt_count >= 0),
  add column if not exists audio_cleanup_status text not null default 'pending'
    check (audio_cleanup_status in ('pending', 'deleted', 'failed')),
  add column if not exists audio_cleanup_attempts integer not null default 0
    check (audio_cleanup_attempts >= 0),
  add column if not exists audio_cleanup_last_error text,
  add column if not exists audio_cleanup_last_error_at timestamptz,
  add column if not exists audio_deleted_at timestamptz,
  add column if not exists transcript_cleanup_status text not null default 'pending'
    check (transcript_cleanup_status in ('pending', 'deleted', 'failed')),
  add column if not exists transcript_cleanup_attempts integer not null default 0
    check (transcript_cleanup_attempts >= 0),
  add column if not exists transcript_cleanup_last_error text,
  add column if not exists transcript_cleanup_last_error_at timestamptz,
  add column if not exists transcript_deleted_at timestamptz;

create or replace function public.guard_analysis_run_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status in ('completed', 'expired') then
    raise exception 'Terminal analysis run cannot move backward' using errcode = '55000';
  end if;

  if old.status = 'failed'
    and old.safe_error_code = 'audio_cleanup_failed'
    and new.status = 'completed'
    and new.audio_cleanup_status = 'deleted'
  then
    return new;
  end if;

  if not (
    (old.status = 'requested' and new.status = 'uploading')
    or (old.status = 'uploading' and new.status in ('transcribing', 'retry_pending', 'failed', 'expired'))
    or (old.status = 'transcribing' and new.status in ('analyzing', 'retry_pending', 'failed', 'expired'))
    or (old.status = 'analyzing' and new.status in ('completed', 'retry_pending', 'failed'))
    or (old.status = 'retry_pending' and new.status in ('uploading', 'failed', 'expired'))
    or (new.status = 'failed' and old.status in ('requested', 'uploading', 'transcribing', 'analyzing', 'retry_pending'))
    or (new.status = 'expired' and old.status in ('failed', 'requested', 'uploading', 'transcribing', 'retry_pending'))
  ) then
    raise exception 'Invalid analysis status transition' using errcode = '22023';
  end if;

  if new.status = 'retry_pending' and old.retry_count >= 2 then
    raise exception 'Analysis retry budget exhausted' using errcode = 'P0001';
  end if;

  if new.status in ('completed', 'expired') and new.audio_cleanup_status <> 'deleted' then
    raise exception 'Audio must be deleted before terminal success or expiry' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists analysis_run_transition_guard on public.analysis_runs;
create trigger analysis_run_transition_guard
before update on public.analysis_runs
for each row execute function public.guard_analysis_run_transition();

create or replace function public.record_analysis_provider_attempt(
  p_run_id uuid,
  p_stage text
)
returns public.analysis_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_run public.analysis_runs%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_stage not in ('transcription', 'feedback') then
    raise exception 'Provider stage required' using errcode = '22023';
  end if;

  update public.analysis_runs
  set transcription_attempt_count = case
        when p_stage = 'transcription' then transcription_attempt_count + 1
        else transcription_attempt_count
      end,
      feedback_attempt_count = case
        when p_stage = 'feedback' then feedback_attempt_count + 1
        else feedback_attempt_count
      end
  where id = p_run_id
  returning * into updated_run;

  if not found then
    raise exception 'Analysis run required' using errcode = '42501';
  end if;

  return updated_run;
end;
$$;

revoke all on function public.record_analysis_provider_attempt(uuid, text) from anon, public, authenticated;
grant execute on function public.record_analysis_provider_attempt(uuid, text) to service_role;

create or replace function public.list_orphaned_quick_read_objects()
returns table(object_path text)
language sql
security definer
set search_path = public, storage
as $$
  select objects.name
  from storage.objects as objects
  where objects.bucket_id = 'quick-read-audio'
    and objects.name like 'quick-read/%'
    and not exists (
      select 1
      from auth.users
      where auth.users.id::text = objects.owner_id
    );
$$;

revoke all on function public.list_orphaned_quick_read_objects() from anon, public, authenticated;
grant execute on function public.list_orphaned_quick_read_objects() to service_role;

-- DOWN
-- drop function if exists public.list_orphaned_quick_read_objects();
-- drop function if exists public.record_analysis_provider_attempt(uuid, text);
-- drop trigger if exists analysis_run_transition_guard on public.analysis_runs;
-- drop function if exists public.guard_analysis_run_transition();
