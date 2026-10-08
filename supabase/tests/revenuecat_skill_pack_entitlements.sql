begin;

select plan(15);

select has_function('public', 'apply_revenuecat_entitlements_snapshot', array[
  'text', 'text', 'timestamp with time zone', 'uuid', 'jsonb', 'timestamp with time zone'
], 'multi-entitlement RevenueCat snapshot RPC exists');
select ok(
  not has_function_privilege('anon', 'public.apply_revenuecat_entitlements_snapshot(text,text,timestamptz,uuid,jsonb,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.apply_revenuecat_entitlements_snapshot(text,text,timestamptz,uuid,jsonb,timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.apply_revenuecat_entitlements_snapshot(text,text,timestamptz,uuid,jsonb,timestamptz)', 'EXECUTE'),
  'only the server service role can apply provider snapshots'
);

set local role postgres;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
) values (
  '77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'revenuecat-pack-test@example.invalid', '', now(), '{}', '{}', false
) on conflict (id) do nothing;
reset role;

set local role service_role;
select is(public.apply_revenuecat_entitlements_snapshot(
  'pack-event-1', 'INITIAL_PURCHASE', now(),
  '77777777-7777-4777-8777-777777777777',
  '[
    {"entitlement_key":"plus","has_entitlement":true,"product_id":"dropmic_plus_annual","status":"active","started_at":"2026-10-01T00:00:00Z","expires_at":"2027-10-01T00:00:00Z","grace_expires_at":null},
    {"entitlement_key":"pack.interview_pro","has_entitlement":true,"product_id":"dropmic_pack_interview_pro","status":"active","started_at":"2026-10-01T00:00:00Z","expires_at":"9999-12-31T23:59:59.999Z","grace_expires_at":null},
    {"entitlement_key":"pack.founder_pitch","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null}
  ]'::jsonb,
  now()
), 'updated', 'one provider event applies Plus and Pack state together');
select is(
  (select status from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'plus'),
  'active', 'Plus remains its own subscription entitlement');
select is(
  (select status from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'pack.interview_pro'),
  'active', 'the permanent Interview Pro entitlement is stored separately');
select is(
  (select count(*)::integer from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'pack.founder_pitch'),
  0, 'an unowned Pack is not created');
select is(public.apply_revenuecat_entitlements_snapshot(
  'pack-event-1', 'INITIAL_PURCHASE', now(),
  '77777777-7777-4777-8777-777777777777',
  '[
    {"entitlement_key":"plus","has_entitlement":true,"product_id":"dropmic_plus_annual","status":"active","started_at":"2026-10-01T00:00:00Z","expires_at":"2027-10-01T00:00:00Z","grace_expires_at":null},
    {"entitlement_key":"pack.interview_pro","has_entitlement":true,"product_id":"dropmic_pack_interview_pro","status":"active","started_at":"2026-10-01T00:00:00Z","expires_at":"9999-12-31T23:59:59.999Z","grace_expires_at":null},
    {"entitlement_key":"pack.founder_pitch","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null}
  ]'::jsonb,
  now()
), 'duplicate', 'a replay cannot re-apply a provider event');
select is(
  (select count(*)::integer from public.revenuecat_webhook_events where owner_id = '77777777-7777-4777-8777-777777777777'),
  1, 'one provider event is recorded once for all entitlement keys');
select is(public.apply_revenuecat_entitlements_snapshot(
  'pack-event-old', 'RENEWAL', now() - interval '1 day',
  '77777777-7777-4777-8777-777777777777',
  '[
    {"entitlement_key":"plus","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null},
    {"entitlement_key":"pack.interview_pro","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null},
    {"entitlement_key":"pack.founder_pitch","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null}
  ]'::jsonb,
  now() - interval '1 day'
), 'updated', 'an older event is ledgered but cannot replace a newer per-key snapshot');
select is(
  (select status from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'plus'),
  'active', 'an older snapshot cannot expire Plus');
select is(
  (select status from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'pack.interview_pro'),
  'active', 'an older snapshot cannot revoke Pack ownership');
select is(public.apply_revenuecat_entitlements_snapshot(
  'pack-event-2', 'REFUND', now(),
  '77777777-7777-4777-8777-777777777777',
  '[
    {"entitlement_key":"plus","has_entitlement":true,"product_id":"dropmic_plus_annual","status":"active","started_at":"2026-10-01T00:00:00Z","expires_at":"2027-10-01T00:00:00Z","grace_expires_at":null},
    {"entitlement_key":"pack.interview_pro","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null},
    {"entitlement_key":"pack.founder_pitch","has_entitlement":false,"product_id":null,"status":null,"started_at":null,"expires_at":null,"grace_expires_at":null}
  ]'::jsonb,
  now()
), 'updated', 'a current refund snapshot removes the refunded Pack');
select is(
  (select status from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'pack.interview_pro'),
  'expired', 'refund revokes the Pack without granting Plus');
select is(
  (select status from public.billing_entitlements where owner_id = '77777777-7777-4777-8777-777777777777' and entitlement_key = 'plus'),
  'active', 'refund handling preserves unrelated Plus state');
select is(
  (select count(*)::integer from public.revenuecat_webhook_events where owner_id = '77777777-7777-4777-8777-777777777777'),
  3, 'distinct provider events are retained for audit and replay protection');

reset role;
select * from finish();
rollback;
