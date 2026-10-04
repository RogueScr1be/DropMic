begin;

select has_function('public', 'rotate_challenge_link', array['uuid'], 'challenge rotation function exists');
select ok(
  (select prosecdef from pg_proc where oid = 'public.rotate_challenge_link(uuid)'::regprocedure)
    and (select proconfig from pg_proc where oid = 'public.rotate_challenge_link(uuid)'::regprocedure)
      @> array['search_path=pg_catalog, public, extensions, auth'],
  'challenge rotation uses a fixed security-definer search path'
);
select ok(
  has_function_privilege('authenticated', 'public.rotate_challenge_link(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.rotate_challenge_link(uuid)', 'EXECUTE')
    and not has_function_privilege('public', 'public.rotate_challenge_link(uuid)', 'EXECUTE'),
  'challenge rotation is authenticated-only'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_event_name_check'
      and pg_get_constraintdef(oid) like '%challenge_link_rotated%'
  ),
  'token rotation telemetry is allowlisted'
);

rollback;
