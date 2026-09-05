-- R0F-B1A executable acceptance. The whole fixture is transaction-wrapped.
begin;

select plan(85);

select has_table('public', 'mic_flow_completions', 'completion table exists');
select has_table('public', 'mic_flow_state', 'state table exists');
select has_pk('public', 'mic_flow_completions', 'completion identity is the primary key');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mic_flow_completions'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (owner_id, completion_id)'
  ),
  'completion identity is scoped by owner'
);
select has_pk('public', 'mic_flow_state', 'owner is the state primary key');
select col_is_fk('public', 'mic_flow_completions', 'owner_id', 'completion owner references auth.users');
select col_is_fk('public', 'mic_flow_state', 'owner_id', 'state owner references auth.users');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.mic_flow_completions'::regclass
      and contype = 'f' and confdeltype = 'c'
  ) and exists (
    select 1 from pg_constraint
    where conrelid = 'public.mic_flow_state'::regclass
      and contype = 'f' and confdeltype = 'c'
  ),
  'both metadata tables cascade from auth.users'
);
select ok((select relrowsecurity from pg_class where oid = 'public.mic_flow_completions'::regclass), 'completion RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.mic_flow_state'::regclass), 'state RLS is enabled');
select ok(has_table_privilege('authenticated', 'public.mic_flow_completions', 'SELECT'), 'authenticated can read completions');
select ok(has_table_privilege('authenticated', 'public.mic_flow_state', 'SELECT'), 'authenticated can read state');
select ok(not has_table_privilege('authenticated', 'public.mic_flow_completions', 'INSERT'), 'authenticated cannot insert completions');
select ok(not has_table_privilege('authenticated', 'public.mic_flow_completions', 'UPDATE'), 'authenticated cannot update completions');
select ok(not has_table_privilege('authenticated', 'public.mic_flow_completions', 'DELETE'), 'authenticated cannot delete completions');
select ok(not has_table_privilege('authenticated', 'public.mic_flow_state', 'INSERT'), 'authenticated cannot insert state');
select ok(not has_table_privilege('authenticated', 'public.mic_flow_state', 'UPDATE'), 'authenticated cannot update state');
select ok(not has_table_privilege('authenticated', 'public.mic_flow_state', 'DELETE'), 'authenticated cannot delete state');
select ok(not has_table_privilege('anon', 'public.mic_flow_completions', 'SELECT'), 'anon cannot read completions');
select ok(not has_table_privilege('anon', 'public.mic_flow_state', 'SELECT'), 'anon cannot read state');
select ok(
  (select prosecdef from pg_proc where oid = 'public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure)
    and (select proconfig from pg_proc where oid = 'public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure)
      @> array['search_path=pg_catalog, public'],
  'completion RPC is a fixed-search-path security definer'
);
select ok(
  has_function_privilege('authenticated', 'public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)', 'EXECUTE')
    and not has_function_privilege('public', 'public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)', 'EXECUTE'),
  'completion RPC is executable only by authenticated users'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.mic_flow_completions'::regclass and pg_get_constraintdef(oid) like '%owner_id, qualifying_day%'),
  'one completion per owner and qualifying day'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.mic_flow_completions'::regclass and pg_get_constraintdef(oid) like '%cold_take%'),
  'supported Mic Flow modes are constrained'
);
select ok(
  pg_get_functiondef('public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'owner transitions use a transaction-scoped serialization lock'
);

-- Synthetic identities are never real users and are removed before finish.
set local role postgres;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r0f-b1a-a@example.invalid', '', now(), '{}', '{}', true),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r0f-b1a-b@example.invalid', '', now(), '{}', '{}', true),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r0f-b1a-c@example.invalid', '', now(), '{}', '{}', true)
on conflict (id) do nothing;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (public.record_mic_flow_completion('r0f-b1a-completion-a', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'credited',
  'first trusted completion is credited'
);
select is((select current_flow from public.mic_flow_state where owner_id = auth.uid()), 1, 'first completion produces Flow 1');
select is((select count(*) from public.mic_flow_completions where owner_id = auth.uid()), 1::bigint, 'first completion creates one row');
select is(
  (public.record_mic_flow_completion('r0f-b1a-completion-a', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'already_credited',
  'exact replay is idempotent'
);
select is((select count(*) from public.mic_flow_completions where owner_id = auth.uid()), 1::bigint, 'replay does not create a row');
select is(
  (public.record_mic_flow_completion('r0f-b1a-completion-a', 'freestyle', 'other-topic', 60, 20, 'UTC', null)->>'status'),
  'unavailable',
  'replay cannot change its stored mode, topic, or duration'
);
select is(
  (public.record_mic_flow_completion('r0f-b1a-completion-b', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'same_day',
  'a second completion on the same day does not advance Flow'
);
select is(
  (public.record_mic_flow_completion('r0f-b1a-completion-invalid', 'cold_take', 'synthetic-topic', 30, 30, 'Not/AZone', null)->>'status'),
  'unavailable',
  'invalid timezone is rejected'
);
select is(
  (public.record_mic_flow_completion('r0f-b1a-completion-mode', 'unsupported', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'unavailable',
  'unsupported mode is rejected'
);
select throws_ok(
  $$insert into public.mic_flow_completions (completion_id, owner_id, mode, topic_id, selected_duration_seconds, completed_duration_seconds, completed_at, timezone, qualifying_day) values ('direct-write', auth.uid(), 'cold_take', 'topic', 30, 30, now(), 'UTC', current_date)$$,
  '42501',
  null,
  'authenticated direct completion insert is rejected'
);
select throws_ok($$update public.mic_flow_state set current_flow = 99 where owner_id = auth.uid()$$, '42501', null, 'authenticated direct state update is rejected');
select throws_ok($$delete from public.mic_flow_state where owner_id = auth.uid()$$, '42501', null, 'authenticated direct state delete is rejected');

-- Owner-scoped completion identity must not reveal a foreign ID.
set local role authenticated;
create temporary table r0f_b1a_identity_responses (
  owner_id uuid primary key,
  response jsonb not null
);
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
insert into r0f_b1a_identity_responses
values (
  auth.uid(),
  public.record_mic_flow_completion('r0f-b1a-completion-a', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)
);
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
insert into r0f_b1a_identity_responses
values (
  auth.uid(),
  public.record_mic_flow_completion('r0f-b1a-completion-c', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)
);
select is(
  (select response->>'status' from r0f_b1a_identity_responses where owner_id = '22222222-2222-4222-8222-222222222222'),
  'credited',
  'fresh owner can use a completion ID owned by another user'
);
select is(
  (select response->>'status' from r0f_b1a_identity_responses where owner_id = '33333333-3333-4333-8333-333333333333'),
  'credited',
  'fresh owner can use a never-seen completion ID'
);
select is(
  (select response - 'state' from r0f_b1a_identity_responses where owner_id = '22222222-2222-4222-8222-222222222222'),
  (select response - 'state' from r0f_b1a_identity_responses where owner_id = '33333333-3333-4333-8333-333333333333'),
  'foreign and unknown IDs return the same response shape'
);
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is(
  (select count(*) from public.mic_flow_completions where owner_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'foreign-ID owner receives its own correctly scoped completion'
);
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select is(
  (select count(*) from public.mic_flow_completions where owner_id = '33333333-3333-4333-8333-333333333333'),
  1::bigint,
  'unknown-ID owner receives its own correctly scoped completion'
);
select is((select count(*) from public.mic_flow_completions where owner_id = auth.uid()), 1::bigint, 'fresh owner has one completion');
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*) from public.mic_flow_completions where owner_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'foreign-ID owner cannot read the original owner completion');
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select is((select count(*) from public.mic_flow_completions where owner_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'unknown-ID owner cannot read the original owner completion');
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((public.record_mic_flow_completion('r0f-b1a-completion-a', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'original owner replay remains idempotent');
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((public.record_mic_flow_completion('r0f-b1a-completion-a', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'foreign-ID owner replay is independently idempotent');
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select is((public.record_mic_flow_completion('r0f-b1a-completion-c', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'unknown-ID owner replay is independently idempotent');
select is((public.record_mic_flow_completion('r0f-b1a-completion-c-second', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'same_day', 'same-day state, not foreign ID existence, returns same_day');
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select is((public.record_mic_flow_completion('r0f-b1a-completion-a', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'same_day', 'same-day state, not foreign ID existence, returns same_day');

-- Reset the owner-scoped fixtures before the entitlement lifecycle checks.
set local role postgres;
delete from public.mic_flow_completions where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state
set current_flow = 0, best_flow = 0, saves_available = 1, last_rewarded_milestone = 0,
    last_qualified_day = null, last_completed_at = null, timezone = null
where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;

-- Move the synthetic state back one server day to exercise chronological advancement.
set local role postgres;
update public.mic_flow_completions
set completed_at = now() - interval '1 day', qualifying_day = (now() at time zone 'UTC')::date - 1
where completion_id = 'r0f-b1a-completion-a';
update public.mic_flow_state
set current_flow = 1, best_flow = 1, last_qualified_day = (now() at time zone 'UTC')::date - 1,
    last_completed_at = now() - interval '1 day', timezone = 'UTC'
where owner_id = '11111111-1111-4111-8111-111111111111';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (public.record_mic_flow_completion('r0f-b1a-consecutive', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'credited',
  'consecutive server-local day advances Flow'
);
select is((select current_flow from public.mic_flow_state where owner_id = auth.uid()), 2, 'consecutive day produces Flow 2');

-- A two-day gap pauses for an explicit Save choice and does not mutate first.
set local role postgres;
update public.mic_flow_state
set current_flow = 2, best_flow = 2, saves_available = 1,
    last_qualified_day = (now() at time zone 'UTC')::date - 2,
    last_completed_at = now() - interval '2 days', timezone = 'UTC'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.mic_flow_completions where completion_id = 'r0f-b1a-consecutive';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (public.record_mic_flow_completion('r0f-b1a-save-prompt', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'save_decision_required',
  'one missed day requires an explicit Save decision'
);
select is((select count(*) from public.mic_flow_completions where completion_id = 'r0f-b1a-save-prompt'), 0::bigint, 'Save prompt inserts no completion');
select is((select current_flow from public.mic_flow_state where owner_id = auth.uid()), 2, 'Save prompt does not mutate Flow');
select is(
  (public.record_mic_flow_completion('r0f-b1a-save-prompt', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', true)->>'status'),
  'credited',
  'accepting a Save protects one missed day'
);
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 0, 'accepted Save consumes one inventory item');

-- Declining a Save resets without consuming inventory, and best Flow is monotonic.
set local role postgres;
delete from public.mic_flow_completions where completion_id = 'r0f-b1a-save-prompt';
update public.mic_flow_state
set current_flow = 3, best_flow = 3, saves_available = 1,
    last_qualified_day = (now() at time zone 'UTC')::date - 2,
    last_completed_at = now() - interval '2 days', timezone = 'UTC'
where owner_id = '11111111-1111-4111-8111-111111111111';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((public.record_mic_flow_completion('r0f-b1a-save-decline', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', false)->>'status'), 'credited', 'declining a Save records a reset completion');
select is((select current_flow from public.mic_flow_state where owner_id = auth.uid()), 1, 'declining a Save resets Flow');
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 1, 'declining a Save preserves inventory');
set local role postgres;
delete from public.mic_flow_completions where completion_id = 'r0f-b1a-save-decline';
update public.mic_flow_state
set current_flow = 1, best_flow = 3, saves_available = 1,
    last_qualified_day = (now() at time zone 'UTC')::date - 1,
    last_completed_at = now() - interval '1 day', timezone = 'UTC'
where owner_id = '11111111-1111-4111-8111-111111111111';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-best-flow', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', false)->>'status'), 'credited', 'a later completion remains eligible after a reset');
select is((select best_flow from public.mic_flow_state where owner_id = '11111111-1111-4111-8111-111111111111'), 3, 'best Flow never decreases');

-- Entitlement states control only the Save cap; malformed or absent access is Free.
set local role postgres;
insert into public.billing_entitlements (
  owner_id, entitlement_key, provider, product_id, status, started_at,
  expires_at, grace_expires_at, last_event_id, last_event_at
)
values (
  '22222222-2222-4222-8222-222222222222', 'plus', 'revenuecat', 'synthetic-plus', 'active',
  now() - interval '1 day', now() + interval '1 day', null, 'synthetic-active', now()
)
on conflict (owner_id, entitlement_key) do update set status = 'active', expires_at = now() + interval '1 day', grace_expires_at = null;
update public.mic_flow_state set saves_available = 3 where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((public.record_mic_flow_completion('r0f-b1a-free-clamp', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'credited', 'active Plus completion is accepted');
set local role postgres;
update public.mic_flow_state set saves_available = 3 where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 3, 'active Plus permits the three-Save cap');
set local role postgres;
update public.billing_entitlements set status = 'grace', expires_at = now() - interval '1 hour', grace_expires_at = now() + interval '1 day' where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state set saves_available = 3 where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-free-clamp', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'valid grace replay is accepted');
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 3, 'valid grace permits the three-Save cap');
set local role postgres;
update public.billing_entitlements set status = 'expired', grace_expires_at = null, expires_at = now() - interval '1 hour' where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state set saves_available = 3 where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-free-clamp', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'expired Plus replay is idempotent');
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 1, 'expired Plus is clamped to the Free cap');
set local role postgres;
update public.billing_entitlements set status = 'revoked', expires_at = now() - interval '1 hour', grace_expires_at = null where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state set saves_available = 3 where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-free-clamp', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'revoked Plus replay is idempotent');
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 1, 'revoked Plus is clamped to the Free cap');
set local role postgres;
delete from public.billing_entitlements where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state set saves_available = 3 where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-free-clamp', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'missing Plus replay is idempotent');
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 1, 'missing Plus is clamped to the Free cap');

-- Seven-day rewards are capped and replay-safe; a timezone change in one real day cannot double count.
set local role postgres;
insert into public.billing_entitlements (
  owner_id, entitlement_key, provider, product_id, status, started_at,
  expires_at, grace_expires_at, last_event_id, last_event_at
)
values ('22222222-2222-4222-8222-222222222222', 'plus', 'revenuecat', 'synthetic-plus', 'active', now() - interval '1 day', now() + interval '1 day', null, 'synthetic-active-2', now())
on conflict (owner_id, entitlement_key) do update set status = 'active', expires_at = now() + interval '1 day', grace_expires_at = null;
delete from public.mic_flow_completions where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state
set current_flow = 6, best_flow = 6, saves_available = 1, last_rewarded_milestone = 0,
    last_qualified_day = (now() at time zone 'UTC')::date - 1, last_completed_at = now() - interval '1 day', timezone = 'UTC'
where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-milestone', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'credited', 'seven-day milestone completion is credited');
select is((select current_flow from public.mic_flow_state where owner_id = '22222222-2222-4222-8222-222222222222'), 7, 'seven-day milestone reaches Flow 7');
select is((select saves_available from public.mic_flow_state where owner_id = '22222222-2222-4222-8222-222222222222'), 2, 'Plus milestone grants one Save');
select is((public.record_mic_flow_completion('r0f-b1a-milestone', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'), 'already_credited', 'milestone replay is idempotent');
select is((select saves_available from public.mic_flow_state where owner_id = '22222222-2222-4222-8222-222222222222'), 2, 'milestone replay cannot duplicate its reward');
set local role postgres;
delete from public.mic_flow_completions where owner_id = '22222222-2222-4222-8222-222222222222';
update public.mic_flow_state set current_flow = 7, best_flow = 7, last_completed_at = now() - interval '10 minutes', last_qualified_day = (now() at time zone 'UTC')::date, timezone = 'UTC' where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((public.record_mic_flow_completion('r0f-b1a-timezone-same-day', 'cold_take', 'synthetic-topic', 30, 30, 'America/Chicago', null)->>'status'), 'same_day', 'timezone changes within one real day cannot double count');
select is((select count(*) from public.mic_flow_completions where owner_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'same-real-day timezone transition inserts no completion');

-- Free entitlement state clamps a stale Plus-sized balance on replay.
set local role postgres;
insert into public.mic_flow_state (owner_id, current_flow, best_flow, saves_available, last_rewarded_milestone)
values ('22222222-2222-4222-8222-222222222222', 0, 0, 3, 0)
on conflict (owner_id) do update set current_flow = 0, best_flow = 0, saves_available = 3,
  last_rewarded_milestone = 0, last_qualified_day = null, last_completed_at = null, timezone = null;
delete from public.mic_flow_completions where owner_id = '22222222-2222-4222-8222-222222222222';
delete from public.billing_entitlements where owner_id = '22222222-2222-4222-8222-222222222222';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is(
  (public.record_mic_flow_completion('r0f-b1a-free-clamp', 'cold_take', 'synthetic-topic', 30, 30, 'UTC', null)->>'status'),
  'credited',
  'Free owner can qualify without a Plus entitlement'
);
select is((select saves_available from public.mic_flow_state where owner_id = auth.uid()), 1, 'missing entitlement uses the Free Save cap');

-- Anonymous access remains unavailable after the owner-scoped repair.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select count(*) from public.mic_flow_state$$, '42501', null, 'anonymous state reads are rejected');
select throws_ok($$select public.record_mic_flow_completion('anonymous-id', 'cold_take', 'topic', 30, 30, 'UTC', null)$$, '42501', null, 'anonymous RPC calls fail closed');

-- Deletion is tested as the final remote operation; cascade leaves no metadata.
set local role postgres;
delete from auth.users where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
reset role;
select is((select count(*) from public.mic_flow_completions), 0::bigint, 'synthetic completion rows are cleaned by deletion');
select is((select count(*) from public.mic_flow_state), 0::bigint, 'synthetic state rows are cleaned by deletion');

select * from finish();
rollback;
