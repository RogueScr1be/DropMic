-- UP
-- One explicit owner-requested retry is allowed for a failed Quick Read while
-- its source audio is still within the existing retention window. The existing
-- retry_count remains the shared total retry budget (maximum two).

alter table public.analysis_runs
  add column if not exists manual_retry_count smallint not null default 0
    check (manual_retry_count between 0 and 1);

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

  if old.status = 'failed'
    and new.status = 'requested'
    and old.safe_error_code in (
      'invalid_model_response_shape',
      'invalid_model_json',
      'invalid_model_schema',
      'unscorable_evaluation',
      'feedback_provider_rejected',
      'transcription_provider_rejected',
      'invalid_transcription_response'
    )
    and old.audio_cleanup_status = 'pending'
    and old.audio_expires_at > now()
    and old.retry_count < 2
    and old.manual_retry_count = 0
    and new.manual_retry_count = 1
    and new.retry_count = old.retry_count + 1
    and new.audio_cleanup_status = 'pending'
    and new.safe_error_code is null
    and not exists (
      select 1
      from public.analysis_results r
      where r.run_id = old.id and r.owner_id = old.owner_id
    )
  then
    return new;
  end if;

  if not (
    (old.status = 'requested' and new.status = 'uploading')
    or (old.status = 'uploading' and new.status in ('transcribing', 'analyzing', 'retry_pending', 'failed', 'expired'))
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

-- DOWN
-- To roll back, restore public.guard_analysis_run_transition() from
-- 20260816020000_r0d_c_lifecycle_hardening.sql, then run:
-- alter table public.analysis_runs drop column if exists manual_retry_count;
