-- DOWN

drop table if exists public.analysis_results;
drop table if exists public.analysis_transcripts;
drop function if exists public.assert_analysis_result_owner();
drop function if exists public.assert_analysis_transcript_owner();
