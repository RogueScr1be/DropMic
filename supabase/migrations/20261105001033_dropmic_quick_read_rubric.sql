-- UP
-- Derived criterion scores live with the durable structured result. Transcript
-- evidence shares the existing private 30-day transcript retention boundary.
alter table public.analysis_results
  add column if not exists rubric_version text,
  add column if not exists rubric_scores jsonb,
  add column if not exists task_profile_version text,
  add column if not exists evaluator_prompt_version text;

alter table public.analysis_results
  add constraint analysis_results_rubric_scores_object
  check (rubric_scores is null or jsonb_typeof(rubric_scores) = 'object');

alter table public.analysis_transcripts
  add column if not exists rubric_evidence jsonb;

alter table public.analysis_transcripts
  add constraint analysis_transcripts_rubric_evidence_object
  check (rubric_evidence is null or jsonb_typeof(rubric_evidence) = 'object');

-- DOWN
-- alter table public.analysis_transcripts drop constraint if exists analysis_transcripts_rubric_evidence_object;
-- alter table public.analysis_transcripts drop column if exists rubric_evidence;
-- alter table public.analysis_results drop constraint if exists analysis_results_rubric_scores_object;
-- alter table public.analysis_results drop column if exists rubric_scores;
-- alter table public.analysis_results drop column if exists task_profile_version;
-- alter table public.analysis_results drop column if exists evaluator_prompt_version;
-- alter table public.analysis_results drop column if exists rubric_version;
