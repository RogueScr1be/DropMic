-- R0D-A rollback. Run only with an approved maintenance window.
-- Remove expired/remaining quick-read objects through the Storage API first.
-- Direct metadata deletion does not remove underlying Storage objects.

drop policy if exists quick_read_audio_insert on storage.objects;
drop policy if exists quick_read_audio_select on storage.objects;
drop policy if exists quick_read_audio_delete on storage.objects;

drop function if exists public.advance_analysis_run(uuid, public.analysis_run_status, text);
drop function if exists public.request_quick_read(uuid, text, text);
drop function if exists public.assert_analysis_run_owner();
drop function if exists public.assert_attempt_metadata_owner();

drop table if exists public.quick_read_daily_usage;
drop table if exists public.analysis_runs;
drop table if exists public.attempt_metrics;
drop type if exists public.analysis_run_status;

-- Bucket removal is intentionally an operator/API step after object deletion:
-- select storage.delete_bucket('quick-read-audio');
