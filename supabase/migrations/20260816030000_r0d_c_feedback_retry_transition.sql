-- R0D-C: allow a feedback retry to resume from an already-persisted transcript.

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
