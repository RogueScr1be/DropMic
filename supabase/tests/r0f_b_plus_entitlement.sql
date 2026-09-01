begin;

select plan(20);

select has_table('public', 'billing_entitlements', 'billing_entitlements exists');
select has_pk('public', 'billing_entitlements', 'owner and entitlement key form the primary key');
select col_is_fk('public', 'billing_entitlements', 'owner_id', 'owner references auth.users');
select col_type_is('public', 'billing_entitlements', 'owner_id', 'uuid', 'owner identity is a UUID');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.billing_entitlements'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.billing_entitlements'::regclass and attname = 'owner_id')]
  ),
  'owner identity references auth.users directly'
);
select col_not_null('public', 'billing_entitlements', 'owner_id', 'owner is required');
select col_not_null('public', 'billing_entitlements', 'entitlement_key', 'entitlement key is required');
select col_not_null('public', 'billing_entitlements', 'provider', 'provider is required');
select col_not_null('public', 'billing_entitlements', 'status', 'status is required');
select col_not_null('public', 'billing_entitlements', 'expires_at', 'expiration is required');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.billing_entitlements'::regclass),
  'RLS is enabled'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_entitlements'
      and policyname = 'billing_entitlements_owner_select'
      and 'authenticated' = any(roles)
      and cmd = 'SELECT'
      and qual like '%auth.uid%'
  ),
  'owner can read only the row matching auth.uid; another owner row is excluded'
);
select ok(has_table_privilege('authenticated', 'public.billing_entitlements', 'SELECT'), 'authenticated can select');
select ok(not has_table_privilege('authenticated', 'public.billing_entitlements', 'INSERT'), 'authenticated cannot insert');
select ok(not has_table_privilege('authenticated', 'public.billing_entitlements', 'UPDATE'), 'authenticated cannot update');
select ok(not has_table_privilege('authenticated', 'public.billing_entitlements', 'DELETE'), 'authenticated cannot delete');
select ok(not has_table_privilege('anon', 'public.billing_entitlements', 'SELECT'), 'anon cannot select');
select ok(has_table_privilege('service_role', 'public.billing_entitlements', 'INSERT'), 'service role can write');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.billing_entitlements'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%entitlement_key%plus%'
  ),
  'entitlement key is restricted to plus'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.billing_entitlements'::regclass
      and confdeltype = 'c'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.billing_entitlements'::regclass and attname = 'owner_id')]
  ),
  'owner deletion cascades entitlement'
);

select * from finish();
rollback;
