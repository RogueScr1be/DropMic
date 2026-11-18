begin;

select plan(9);

select has_column('public', 'analysis_results', 'rubric_version', 'durable result stores the rubric version');
select has_column('public', 'analysis_results', 'rubric_scores', 'durable result stores the 16 derived criterion points');
select has_column('public', 'analysis_results', 'task_profile_version', 'durable result records the task profile version');
select has_column('public', 'analysis_results', 'evaluator_prompt_version', 'durable result records the evaluator prompt version');
select has_column('public', 'analysis_transcripts', 'rubric_evidence', 'evidence remains within the transcript retention row');
select ok(has_table_privilege('authenticated', 'public.analysis_results', 'SELECT'), 'owners retain access to their structured results');
select ok(not has_table_privilege('authenticated', 'public.analysis_transcripts', 'SELECT'), 'clients cannot read private transcript evidence directly');
select ok(has_table_privilege('service_role', 'public.analysis_transcripts', 'UPDATE'), 'service role can persist and expire transcript evidence');
select ok(
  exists (select 1 from pg_constraint where conname = 'analysis_results_rubric_scores_object')
  and exists (select 1 from pg_constraint where conname = 'analysis_transcripts_rubric_evidence_object'),
  'JSONB rubric payloads must be objects'
);

select * from finish();
rollback;
