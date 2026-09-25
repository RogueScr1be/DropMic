begin;
select plan(35);

select has_table('public', 'challenge_links', 'challenge_links exists');
select col_is_unique('public', 'challenge_links', 'token_hash', 'challenge token hash is unique');
select col_is_fk('public', 'challenge_links', 'owner_id', 'challenge owner references auth.users');
select col_is_fk('public', 'challenge_links', 'source_attempt_id', 'challenge source references attempts');
select ok((select relrowsecurity from pg_class where oid = 'public.challenge_links'::regclass), 'challenge RLS is enabled');
select ok(not has_table_privilege('anon', 'public.challenge_links', 'SELECT'), 'anonymous clients cannot select challenge rows');
select ok(not has_table_privilege('anon', 'public.challenge_links', 'INSERT'), 'anonymous clients cannot insert challenge rows');
select ok(not has_table_privilege('authenticated', 'public.challenge_links', 'INSERT'), 'authenticated clients cannot insert challenge rows directly');
select ok(has_table_privilege('authenticated', 'public.challenge_links', 'SELECT'), 'owners can select their challenge rows');
select ok(has_table_privilege('authenticated', 'public.challenge_links', 'UPDATE'), 'owners can disable their challenge rows');
select ok(has_table_privilege('service_role', 'public.challenge_links', 'SELECT'), 'service role owns challenge function access');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'challenge_links' and indexname = 'challenge_links_owner_created_idx'), 'challenge creation throttle has an owner/time index');
select ok(exists (select 1 from pg_policies where tablename = 'challenge_links' and policyname = 'challenge_links_owner_select' and qual like '%auth.uid%'), 'challenge reads are owner-isolated');
select ok(exists (select 1 from pg_attribute where attrelid = 'public.challenge_links'::regclass and attname = 'accepted_at'), 'challenge acceptance timestamp exists');
select ok(exists (select 1 from pg_attribute where attrelid = 'public.challenge_links'::regclass and attname = 'disabled_at'), 'challenge disabled timestamp exists');
select has_trigger('public', 'challenge_links', 'challenge_links_owner_guard', 'challenge source ownership trigger exists');
select ok(
  (select prosecdef from pg_proc where oid = 'public.assert_challenge_owner()'::regprocedure)
    and (select proconfig from pg_proc where oid = 'public.assert_challenge_owner()'::regprocedure) @> array['search_path=pg_catalog, public'],
  'challenge owner trigger uses a fixed security-definer search path'
);
select ok(
  has_function_privilege('service_role', 'public.assert_challenge_owner()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.assert_challenge_owner()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.assert_challenge_owner()', 'EXECUTE'),
  'challenge owner trigger function is not directly callable by clients'
);
select has_table('public', 'analytics_events', 'analytics_events exists');
select col_is_unique('public', 'analytics_events', 'event_key', 'analytics events are idempotent');
select ok((select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass), 'analytics RLS is enabled');
select ok(has_table_privilege('anon', 'public.analytics_events', 'INSERT'), 'anonymous funnel events may be inserted');
select ok(not has_table_privilege('anon', 'public.analytics_events', 'SELECT'), 'anonymous clients cannot read analytics');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'SELECT'), 'authenticated clients cannot read analytics');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'UPDATE'), 'authenticated clients cannot mutate analytics');
select ok(has_table_privilege('service_role', 'public.analytics_events', 'SELECT'), 'service role owns analytics access');
select ok(exists (select 1 from pg_policies where tablename = 'analytics_events' and policyname = 'analytics_events_insert_safe'), 'analytics insert policy validates envelope');
select ok((select qual from pg_policies where tablename = 'analytics_events' and policyname = 'analytics_events_insert_safe') like '%owner_id is null%', 'analytics rejects caller-supplied owner identities');
select ok(exists (select 1 from pg_policies where tablename = 'challenge_links' and policyname = 'challenge_links_owner_delete'), 'owners can delete challenges');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.challenge_links'::regclass and pg_get_constraintdef(oid) like '%duration_seconds%30%60%90%'), 'challenge duration is constrained');

set local role postgres;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'launch-owner@example.invalid', '', now(), '{}', '{}', false),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'launch-other@example.invalid', '', now(), '{}', '{}', false)
on conflict (id) do nothing;
insert into public.attempts (
  id, owner_id, client_attempt_id, topic_id, selected_duration_seconds,
  completed_duration_seconds, completed_at
)
values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'launch-owner-attempt', 'launch', 30, 30, now()
);
insert into public.challenge_links (
  owner_id, source_attempt_id, token_hash, prompt, duration_seconds, expires_at, status
)
values
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', repeat('a', 64), 'Owner challenge', 30, now() + interval '1 day', 'active'),
  ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', repeat('b', 64), 'Other challenge', 60, now() + interval '1 day', 'disabled');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select count(*) from public.challenge_links), 1::bigint, 'authenticated owner sees only own challenge');
select is((select prompt from public.challenge_links), 'Owner challenge', 'owner sees the public-management row');
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*) from public.challenge_links), 1::bigint, 'second owner sees only own challenge');
select is((select prompt from public.challenge_links), 'Other challenge', 'cross-owner challenge data is hidden');
reset role;

set local role anon;
select throws_ok($$select count(*) from public.challenge_links$$, '42501', null, 'anonymous direct challenge enumeration is denied');
select throws_ok($$insert into public.analytics_events (event_name, event_key, owner_id) values ('app_opened', 'owner-spoof', '11111111-1111-4111-8111-111111111111')$$, '42501', null, 'analytics rejects caller-supplied owner identity');
reset role;

delete from auth.users where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

select * from finish();
rollback;
