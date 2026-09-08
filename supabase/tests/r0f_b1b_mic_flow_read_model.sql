-- R0F-B1B executable read-model acceptance. The fixture is transaction-wrapped.
begin;

select plan(34);

select has_function('public', 'get_mic_flow_snapshot', array['text'], 'snapshot RPC exists');
select has_function(
  'public',
  '_mic_flow_snapshot_status',
  array['timestamptz', 'text', 'text', 'timestamptz', 'integer'],
  'snapshot status helper exists'
);
select ok(
  (select provolatile = 's' and not prosecdef from pg_proc
   where oid = 'public._mic_flow_snapshot_status(timestamptz,text,text,timestamptz,integer)'::regprocedure)
    and not has_function_privilege('public', 'public._mic_flow_snapshot_status(timestamptz,text,text,timestamptz,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public._mic_flow_snapshot_status(timestamptz,text,text,timestamptz,integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._mic_flow_snapshot_status(timestamptz,text,text,timestamptz,integer)', 'EXECUTE'),
  'snapshot status helper is stable and not client-executable'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.get_mic_flow_snapshot(text)'::regprocedure)
    and (select proconfig from pg_proc where oid = 'public.get_mic_flow_snapshot(text)'::regprocedure)
      @> array['search_path=pg_catalog, public'],
  'snapshot RPC is a fixed-search-path security definer'
);
select ok(
  has_function_privilege('authenticated', 'public.get_mic_flow_snapshot(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_mic_flow_snapshot(text)', 'EXECUTE')
    and not has_function_privilege('public', 'public.get_mic_flow_snapshot(text)', 'EXECUTE'),
  'snapshot RPC is executable only by authenticated users'
);

set local role postgres;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
)
values
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r0f-b1b-a@example.invalid', '', now(), '{}', '{}', true),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r0f-b1b-b@example.invalid', '', now(), '{}', '{}', true)
on conflict (id) do nothing;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select is(
  public.get_mic_flow_snapshot('UTC')->>'status',
  'not_started',
  'missing state is not_started'
);
select is(
  (public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer,
  1,
  'Free not_started state has one Save'
);
select is(
  (public.get_mic_flow_snapshot('UTC')->>'current_flow')::integer,
  0,
  'not_started state has zero current Flow'
);
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
select is(
  public.get_mic_flow_snapshot('UTC')->>'status',
  'not_started',
  'owner-scoped snapshot does not reveal another owner state'
);
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select is(
  public.get_mic_flow_snapshot('Not/AZone')->>'status',
  'unavailable',
  'invalid timezone fails closed'
);

set local role postgres;
insert into public.mic_flow_state (
  owner_id, current_flow, best_flow, saves_available, last_rewarded_milestone,
  last_qualified_day, last_completed_at, timezone
)
values (
  '44444444-4444-4444-8444-444444444444', 4, 9, 1, 0,
  (now() at time zone 'UTC')::date, now() - interval '10 minutes', 'UTC'
);
reset role;
set local role authenticated;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'protected_today', 'same server day is protected_today');
select is((public.get_mic_flow_snapshot('UTC')->>'current_flow')::integer, 4, 'snapshot exposes current Flow');
select is((public.get_mic_flow_snapshot('UTC')->>'best_flow')::integer, 9, 'snapshot exposes best Flow');
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 1, 'snapshot exposes Save balance');

set local role postgres;
update public.mic_flow_state
set last_qualified_day = (now() at time zone 'UTC')::date,
    last_completed_at = now() - interval '10 minutes',
    timezone = 'UTC'
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is(public.get_mic_flow_snapshot('America/Chicago')->>'status', 'protected_today', 'timezone transition within one real period stays protected');

set local role postgres;
update public.mic_flow_state
set last_qualified_day = (now() at time zone 'UTC')::date - 1,
    last_completed_at = now() - interval '1 day',
    timezone = 'UTC'
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'needs_rep_today', 'next server day needs a rep');

set local role postgres;
update public.mic_flow_state
set last_qualified_day = (now() at time zone 'UTC')::date - 2,
    last_completed_at = now() - interval '2 days',
    timezone = 'UTC',
    saves_available = 1
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'recoverable_with_save', 'one missed day with a Save is recoverable');

set local role postgres;
update public.mic_flow_state set saves_available = 0 where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'reset_pending', 'one missed day without a Save is reset_pending');
select is((public.get_mic_flow_snapshot('UTC')->>'best_flow')::integer, 9, 'reset_pending preserves Best Mic Flow');

set local role postgres;
update public.mic_flow_state
set last_qualified_day = (now() at time zone 'UTC')::date - 3,
    last_completed_at = now() - interval '3 days',
    timezone = 'UTC',
    saves_available = 1
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'reset_pending', 'multiple missed days are reset_pending');

set local role postgres;
insert into public.billing_entitlements (
  owner_id, entitlement_key, provider, product_id, status, started_at,
  expires_at, grace_expires_at, last_event_id, last_event_at
)
values (
  '44444444-4444-4444-8444-444444444444', 'plus', 'revenuecat', 'r0f-b1b-plus', 'active',
  now() - interval '1 day', now() + interval '1 day', null, 'r0f-b1b-event', now()
);
update public.mic_flow_state
set last_qualified_day = (now() at time zone 'UTC')::date - 2,
    last_completed_at = now() - interval '2 days',
    timezone = 'UTC',
    saves_available = 3
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 3, 'active Plus permits three Saves');

set local role postgres;
update public.billing_entitlements
set status = 'grace', expires_at = now() - interval '1 hour', grace_expires_at = now() + interval '1 day'
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 3, 'valid grace permits three Saves');

set local role postgres;
update public.billing_entitlements
set status = 'expired', grace_expires_at = null, expires_at = now() - interval '1 hour'
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 1, 'expired Plus uses Free Save cap');

set local role postgres;
update public.billing_entitlements
set status = 'revoked', expires_at = now() + interval '1 hour', grace_expires_at = null
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 1, 'revoked Plus uses Free Save cap');

set local role postgres;
update public.billing_entitlements
set status = 'active', product_id = '   ', expires_at = now() + interval '1 day', grace_expires_at = null
where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 1, 'malformed entitlement uses Free Save cap');

set local role postgres;
update public.mic_flow_state set saves_available = 3 where owner_id = '44444444-4444-4444-8444-444444444444';
delete from public.billing_entitlements where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is((public.get_mic_flow_snapshot('UTC')->>'saves_available')::integer, 1, 'missing Plus uses Free Save cap without writing');

set local role postgres;
select is(
  public._mic_flow_snapshot_status(
    '2026-09-05 23:59:59+00'::timestamptz, 'UTC', 'UTC',
    '2026-09-06 00:00:00+00'::timestamptz, 0
  ),
  'needs_rep_today',
  'exact local midnight starts the next required day'
);
select is(
  public._mic_flow_snapshot_status(
    '2026-03-08 06:59:59+00'::timestamptz, 'America/Chicago', 'America/Chicago',
    '2026-03-08 08:00:00+00'::timestamptz, 0
  ),
  'protected_today',
  'DST spring-forward boundary remains the same local day'
);
select is(
  public._mic_flow_snapshot_status(
    '2026-11-01 06:59:59+00'::timestamptz, 'America/Chicago', 'America/Chicago',
    '2026-11-01 07:00:00+00'::timestamptz, 0
  ),
  'protected_today',
  'DST fall-back boundary remains the same local day'
);
reset role;

set local role postgres;
update public.mic_flow_state set timezone = 'Not/AZone' where owner_id = '44444444-4444-4444-8444-444444444444';
reset role;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'unavailable', 'malformed stored timezone fails closed');

set local role anon;
select throws_ok($$select public.get_mic_flow_snapshot('UTC')$$, '42501', null, 'anonymous snapshot calls are rejected');
reset role;

set local role postgres;
select is((select count(*) from public.mic_flow_state), 1::bigint, 'snapshot performs no writes to state');
select is((select count(*) from public.mic_flow_completions), 0::bigint, 'snapshot performs no writes to completions');
delete from auth.users where id in ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555');
reset role;
select is((select count(*) from public.mic_flow_state), 0::bigint, 'synthetic state is removed by cascade');

select * from finish();
rollback;
