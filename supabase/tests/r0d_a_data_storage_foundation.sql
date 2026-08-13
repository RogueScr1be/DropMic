-- R0D-A pgTAP contract checks. These run with `supabase test db`.
begin;
select plan(28);

select has_table('public', 'attempt_metrics', 'attempt metrics table exists');
select has_table('public', 'analysis_runs', 'analysis runs table exists');
select has_table('public', 'quick_read_daily_usage', 'daily quota table exists');
select col_is_pk('public', 'attempt_metrics', 'attempt_id', 'attempt metrics is one row per attempt');
select col_is_unique('public', 'analysis_runs', 'attempt_id', 'one analysis run per attempt');
select col_is_unique('public', 'analysis_runs', 'idempotency_key', 'analysis idempotency keys are unique');
select col_default_is('public', 'attempt_metrics', 'metric_schema_version', '''r0d.1''', 'metric schema is versioned');
select col_default_is('public', 'attempt_metrics', 'derived_metrics', '''{}''::jsonb', 'derived metrics default to an object');
select col_default_is('public', 'analysis_runs', 'status', '''requested''::public.analysis_run_status', 'analysis starts requested');
select col_default_is('public', 'analysis_runs', 'retry_count', '0', 'analysis retries start at zero');
select col_default_is('public', 'quick_read_daily_usage', 'consumed_count', '0', 'daily quota starts at zero');
select policies_are('public', 'attempt_metrics', array['attempt_metrics_owner_select'], 'attempt metrics has owner read policy');
select policies_are('public', 'analysis_runs', array['analysis_runs_owner_select'], 'analysis runs has owner read policy');
select policies_are('public', 'quick_read_daily_usage', array[]::text[], 'daily quota has no client policies');
select function_privs_are('public', 'request_quick_read', array['authenticated=EXECUTE'], 'request boundary is authenticated-only');
select function_privs_are('public', 'advance_analysis_run', array['authenticated=EXECUTE'], 'status transition boundary is authenticated-only');
select function_privs_are('public', 'delete_my_account', array['authenticated=EXECUTE'], 'account deletion remains authenticated-only');
select ok(exists(select 1 from storage.buckets where id = 'quick-read-audio' and public = false), 'quick read bucket is private');
select ok(exists(select 1 from storage.buckets where id = 'quick-read-audio' and file_size_limit = 52428800), 'quick read bucket has a 50 MiB limit');
select ok(exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'quick_read_audio_insert'), 'storage insert policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'quick_read_audio_select'), 'storage select policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'quick_read_audio_delete'), 'storage delete policy exists');
select has_function('public', 'request_quick_read', array['uuid', 'text', 'text'], 'request boundary exists');
select has_function('public', 'advance_analysis_run', array['uuid', 'public.analysis_run_status', 'text'], 'status transition function exists');
select col_not_null('public', 'analysis_runs', 'audio_expires_at', 'audio cleanup deadline is required');
select col_not_null('public', 'analysis_runs', 'transcript_expires_at', 'transcript cleanup deadline is required');
select col_not_null('public', 'analysis_runs', 'audio_object_path', 'audio path is server-owned');
select col_not_null('public', 'attempt_metrics', 'metric_schema_version', 'metric version is required');

select * from finish();
rollback;
