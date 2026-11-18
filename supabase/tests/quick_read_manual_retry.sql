begin;

select plan(5);

select has_column(
  'public', 'analysis_runs', 'manual_retry_count',
  'analysis runs track the one explicit retry'
);

select has_trigger(
  'public', 'analysis_runs', 'analysis_run_transition_guard',
  'terminal transition guard remains installed'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.analysis_runs'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%manual_retry_count%'
  ),
  'manual retry count is constrained'
);

select ok(
  pg_catalog.pg_get_functiondef('public.guard_analysis_run_transition()'::regprocedure)
    like '%old.manual_retry_count = 0%'
    and pg_catalog.pg_get_functiondef('public.guard_analysis_run_transition()'::regprocedure)
      like '%new.manual_retry_count = 1%'
    and pg_catalog.pg_get_functiondef('public.guard_analysis_run_transition()'::regprocedure)
      like '%old.retry_count < 2%',
  'failed-to-request transition is bounded to one retry inside the shared budget'
);

select ok(
  pg_catalog.pg_get_functiondef('public.guard_analysis_run_transition()'::regprocedure)
    like '%old.status = ''uploading'' and new.status in (''transcribing'', ''analyzing'',%',
  'persisted transcripts may resume directly from uploading to analyzing'
);

select * from finish();
rollback;
