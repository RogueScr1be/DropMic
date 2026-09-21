begin;

select no_plan();

select ok(
  has_function_privilege('service_role', 'public.list_orphaned_quick_read_objects()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.list_orphaned_quick_read_objects()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.list_orphaned_quick_read_objects()', 'EXECUTE'),
  'orphan storage query remains service-role-only'
);

set local role postgres;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa8b-owner@example.invalid', '', now(), '{}', '{}', true),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa8b-active@example.invalid', '', now(), '{}', '{}', true),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa8b-reference@example.invalid', '', now(), '{}', '{}', true)
on conflict (id) do nothing;

insert into public.attempts (
  id, owner_id, client_attempt_id, topic_id, selected_duration_seconds,
  completed_duration_seconds, completed_at
)
values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'qa8b-active-attempt', 'qa8b', 30, 30, now()
), (
  '55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333',
  'qa8b-reference-attempt', 'qa8b', 30, 30, now()
);

insert into public.analysis_runs (
  id, attempt_id, owner_id, idempotency_key, status, audio_object_path,
  audio_expires_at, transcript_expires_at
)
values (
  '66666666-6666-4666-8666-666666666666',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'qa8b-active-run', 'analyzing',
  'quick-read/22222222-2222-4222-8222-222222222222/77777777-7777-4777-8777-777777777777/source.m4a',
  now() + interval '1 day', now() + interval '1 day'
), (
  '88888888-8888-4888-8888-888888888888',
  '55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333',
  'qa8b-referenced-run', 'completed',
  'quick-read/11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999/source.m4a',
  now() + interval '1 day', now() + interval '1 day'
);

insert into storage.objects (bucket_id, name, owner_id, created_at, updated_at, metadata)
values
  ('quick-read-audio', 'quick-read/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.m4a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '36 days', now() - interval '36 days', '{}'),
  ('quick-read-audio', 'quick-read/11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.m4a', '11111111-1111-4111-8111-111111111111', now() - interval '35 days', now() - interval '35 days', '{}'),
  ('quick-read-audio', 'quick-read/11111111-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd/source.m4a', '11111111-1111-4111-8111-111111111111', now() - interval '1 hour', now() - interval '1 hour', '{}'),
  ('quick-read-audio', 'quick-read/22222222-2222-4222-8222-222222222222/77777777-7777-4777-8777-777777777777/source.m4a', '22222222-2222-4222-8222-222222222222', now() - interval '36 days', now() - interval '36 days', '{}'),
  ('quick-read-audio', 'quick-read/11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999/source.m4a', '11111111-1111-4111-8111-111111111111', now() - interval '36 days', now() - interval '36 days', '{}'),
  ('quick-read-audio', 'quick-read/not-a-uuid/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/source.m4a', '11111111-1111-4111-8111-111111111111', now() - interval '36 days', now() - interval '36 days', '{}'),
  ('quick-read-audio', 'quick-read/11111111-1111-4111-8111-111111111111/ffffffff-ffff-4fff-8fff-ffffffffffff/source.m4a', '22222222-2222-4222-8222-222222222222', now() - interval '36 days', now() - interval '36 days', '{}');

reset role;

select results_eq(
  $$select object_path from public.list_orphaned_quick_read_objects()$$,
  $$values
    ('quick-read/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.m4a'),
    ('quick-read/11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.m4a')$$,
  'only aged, structurally valid, unreferenced objects are eligible'
);

delete from storage.objects where bucket_id = 'quick-read-audio' and name like 'quick-read/%';
delete from public.analysis_runs where id in ('66666666-6666-4666-8666-666666666666', '88888888-8888-4888-8888-888888888888');
delete from public.attempts where id in ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555');
delete from auth.users where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

select * from finish();
rollback;
