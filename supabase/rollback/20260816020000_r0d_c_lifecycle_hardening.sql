drop function if exists public.list_orphaned_quick_read_objects();
drop function if exists public.record_analysis_provider_attempt(uuid, text);
drop trigger if exists analysis_run_transition_guard on public.analysis_runs;
drop function if exists public.guard_analysis_run_transition();

alter table public.analysis_runs
  drop column if exists transcription_attempt_count,
  drop column if exists feedback_attempt_count,
  drop column if exists audio_cleanup_status,
  drop column if exists audio_cleanup_attempts,
  drop column if exists audio_cleanup_last_error,
  drop column if exists audio_cleanup_last_error_at,
  drop column if exists audio_deleted_at,
  drop column if exists transcript_cleanup_status,
  drop column if exists transcript_cleanup_attempts,
  drop column if exists transcript_cleanup_last_error,
  drop column if exists transcript_cleanup_last_error_at,
  drop column if exists transcript_deleted_at;
