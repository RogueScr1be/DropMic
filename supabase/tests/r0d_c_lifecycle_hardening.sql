begin;
select plan(9);

select has_column('public', 'analysis_runs', 'transcription_attempt_count', 'transcription attempts are tracked');
select has_column('public', 'analysis_runs', 'feedback_attempt_count', 'feedback attempts are tracked');
select has_column('public', 'analysis_runs', 'audio_cleanup_status', 'audio cleanup state is tracked');
select has_column('public', 'analysis_runs', 'transcript_cleanup_status', 'transcript cleanup state is tracked');
select has_trigger('public', 'analysis_runs', 'analysis_run_transition_guard', 'terminal transition guard exists');
select has_function('public', 'record_analysis_provider_attempt', array['uuid', 'text'], 'provider attempt recorder exists');
select has_function('public', 'list_orphaned_quick_read_objects', array[]::text[], 'orphan storage query exists');
select ok(
  has_function_privilege('service_role', 'public.record_analysis_provider_attempt(uuid,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_analysis_provider_attempt(uuid,text)', 'EXECUTE'),
  'provider attempt recorder is service-role-only'
);
select ok(
  has_function_privilege('service_role', 'public.list_orphaned_quick_read_objects()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.list_orphaned_quick_read_objects()', 'EXECUTE'),
  'orphan storage query is service-role-only'
);

select * from finish();
rollback;
