select has_column('public', 'analysis_runs', 'transcription_attempt_count', 'transcription attempts are tracked');
select has_column('public', 'analysis_runs', 'feedback_attempt_count', 'feedback attempts are tracked');
select has_column('public', 'analysis_runs', 'audio_cleanup_status', 'audio cleanup state is tracked');
select has_column('public', 'analysis_runs', 'transcript_cleanup_status', 'transcript cleanup state is tracked');
select has_trigger('public', 'analysis_runs', 'analysis_run_transition_guard', 'terminal transition guard exists');
select has_function('public', 'record_analysis_provider_attempt', array['uuid', 'text'], 'provider attempt recorder exists');
select has_function('public', 'list_orphaned_quick_read_objects', array[]::text[], 'orphan storage query exists');
select function_privs_are(
  'public',
  'record_analysis_provider_attempt',
  array['service_role=EXECUTE'],
  'provider attempt recorder is service-role-only'
);
select function_privs_are(
  'public',
  'list_orphaned_quick_read_objects',
  array['service_role=EXECUTE'],
  'orphan storage query is service-role-only'
);
