begin;

select plan(18);

select has_table('public', 'analysis_transcripts', 'analysis_transcripts exists');
select has_table('public', 'analysis_results', 'analysis_results exists');
select has_pk('public', 'analysis_transcripts', 'analysis_transcripts has run primary key');
select has_pk('public', 'analysis_results', 'analysis_results has run primary key');
select col_is_fk('public', 'analysis_transcripts', 'run_id', 'analysis_transcripts run references analysis_runs');
select col_is_fk('public', 'analysis_transcripts', 'attempt_id', 'analysis_transcripts attempt references attempts');
select col_is_fk('public', 'analysis_results', 'run_id', 'analysis_results run references analysis_runs');
select col_is_fk('public', 'analysis_results', 'attempt_id', 'analysis_results attempt references attempts');
select has_index('public', 'analysis_transcripts', 'analysis_transcripts_expiry_idx', 'transcript expiry index exists');
select has_index('public', 'analysis_results', 'analysis_results_owner_idx', 'result owner index exists');
select col_not_null('public', 'analysis_transcripts', 'transcript_expires_at', 'transcript expiry is required');
select col_not_null('public', 'analysis_results', 'clarity', 'clarity is required');
select col_not_null('public', 'analysis_results', 'structure', 'structure is required');
select col_not_null('public', 'analysis_results', 'specificity', 'specificity is required');
select col_not_null('public', 'analysis_results', 'concision', 'concision is required');
select col_not_null('public', 'analysis_results', 'strength', 'strength is required');
select col_not_null('public', 'analysis_results', 'improvement', 'improvement is required');
select col_not_null('public', 'analysis_results', 'next_drill', 'next drill is required');

select * from finish();
rollback;
