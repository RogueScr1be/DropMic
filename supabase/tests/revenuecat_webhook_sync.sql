begin;

select plan(13);

select has_table('public', 'revenuecat_webhook_events', 'RevenueCat webhook idempotency table exists');
select has_pk('public', 'revenuecat_webhook_events', 'event ID and owner form the idempotency key');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.revenuecat_webhook_events'::regclass),
  'webhook ledger has RLS enabled'
);
select ok(not has_table_privilege('authenticated', 'public.revenuecat_webhook_events', 'SELECT'), 'clients cannot inspect webhook ledger');
select ok(has_table_privilege('service_role', 'public.revenuecat_webhook_events', 'INSERT'), 'service role can write webhook ledger');
select has_function('public', 'apply_revenuecat_entitlement_snapshot', array[
  'text', 'text', 'timestamp with time zone', 'uuid', 'boolean', 'text',
  'timestamp with time zone', 'timestamp with time zone', 'timestamp with time zone',
  'text', 'timestamp with time zone'
], 'server snapshot RPC exists');
select ok(
  not has_function_privilege('anon', 'public.apply_revenuecat_entitlement_snapshot(text,text,timestamptz,uuid,boolean,text,timestamptz,timestamptz,timestamptz,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.apply_revenuecat_entitlement_snapshot(text,text,timestamptz,uuid,boolean,text,timestamptz,timestamptz,timestamptz,text,timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.apply_revenuecat_entitlement_snapshot(text,text,timestamptz,uuid,boolean,text,timestamptz,timestamptz,timestamptz,text,timestamptz)', 'EXECUTE'),
  'only service role can apply RevenueCat snapshots'
);

set local role postgres;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
) values (
  '66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'revenuecat-test@example.invalid', '', now(), '{}', '{}', true
) on conflict (id) do nothing;
reset role;

set local role service_role;
select is(public.apply_revenuecat_entitlement_snapshot(
  'event-1', 'INITIAL_PURCHASE', '2026-10-08T12:00:00Z',
  '66666666-6666-4666-8666-666666666666', true, 'dropmic_plus_lifetime',
  '2026-10-08T11:00:00Z', '9999-12-31T23:59:59.999Z', null, 'active',
  '2026-10-08T12:00:01Z'
), 'updated', 'lifetime snapshot is recorded');
select is(public.apply_revenuecat_entitlement_snapshot(
  'event-1', 'INITIAL_PURCHASE', '2026-10-08T12:00:00Z',
  '66666666-6666-4666-8666-666666666666', true, 'dropmic_plus_lifetime',
  '2026-10-08T11:00:00Z', '9999-12-31T23:59:59.999Z', null, 'active',
  '2026-10-08T12:00:01Z'
), 'duplicate', 'replayed event is idempotent');
select is(public.apply_revenuecat_entitlement_snapshot(
  'event-0', 'EXPIRATION', '2026-10-08T11:00:00Z',
  '66666666-6666-4666-8666-666666666666', false, null, null, null, null, null,
  '2026-10-08T11:59:59Z'
), 'stale', 'older provider snapshot cannot overwrite newer state');
select is(public.apply_revenuecat_entitlement_snapshot(
  'event-2', 'EXPIRATION', '2026-10-08T13:00:00Z',
  '66666666-6666-4666-8666-666666666666', false, null, null, null, null, null,
  '2026-10-08T13:00:01Z'
), 'expired', 'current provider snapshot removes access');
reset role;

select is(
  (select status from public.billing_entitlements where owner_id = '66666666-6666-4666-8666-666666666666'),
  'expired',
  'expired provider state is persisted'
);
select is(
  (select count(*)::integer from public.revenuecat_webhook_events where owner_id = '66666666-6666-4666-8666-666666666666'),
  3,
  'unique events are retained without duplicate ledger rows'
);

select * from finish();
rollback;
