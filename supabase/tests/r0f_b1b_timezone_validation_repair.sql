-- Local pgTAP fixtures are transaction-scoped; no persistent identities.
begin;
select no_plan();

create temporary table timezone_repair_owners (label text primary key, owner_id uuid not null);
insert into timezone_repair_owners values ('a', gen_random_uuid()), ('b', gen_random_uuid());
grant select on timezone_repair_owners to authenticated;
insert into auth.users (id, aud, role, is_anonymous)
select owner_id, 'authenticated', 'authenticated', true from timezone_repair_owners;

select ok(exists (select 1 from pg_catalog.pg_timezone_names where name = 'America/Indiana/Indianapolis'), 'Indianapolis is in the running catalog');
select ok(exists (select 1 from pg_catalog.pg_timezone_names where name = 'America/Argentina/Buenos_Aires'), 'second multi-segment zone is in the running catalog');

select is(provolatile::text, 'v', 'completion retains VOLATILE')
from pg_proc where oid = 'public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure;
select is(provolatile::text, 's', 'snapshot retains STABLE')
from pg_proc where oid = 'public.get_mic_flow_snapshot(text)'::regprocedure;
select ok(prosecdef and proconfig @> array['search_path=pg_catalog, public'], proname || ' retains security definer and safe search path')
from pg_proc where oid in ('public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure, 'public.get_mic_flow_snapshot(text)'::regprocedure);
select ok(pg_get_userbyid(proowner) = 'postgres', proname || ' retains postgres ownership')
from pg_proc where oid in ('public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure, 'public.get_mic_flow_snapshot(text)'::regprocedure);
select ok(
  has_function_privilege('authenticated', oid, 'EXECUTE')
  and has_function_privilege('service_role', oid, 'EXECUTE')
  and not has_function_privilege('anon', oid, 'EXECUTE')
  and not exists (select 1 from aclexplode(proacl) where grantee = 0 and privilege_type = 'EXECUTE'),
  proname || ' retains authenticated/service grants and public/anon rejection'
) from pg_proc where oid in ('public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure, 'public.get_mic_flow_snapshot(text)'::regprocedure);
select ok(
  position('!~' in prosrc) = 0 and position('trim(p_timezone)' in prosrc) = 0
  and position('where name = p_timezone' in prosrc) > 0
  and position('where name = state_row.timezone' in prosrc) > 0,
  proname || ' uses exact catalog policy for requested and stored zones'
) from pg_proc where oid in ('public.record_mic_flow_completion(text,text,text,integer,integer,text,boolean)'::regprocedure, 'public.get_mic_flow_snapshot(text)'::regprocedure);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '', true); end $$;
select is(public.get_mic_flow_snapshot('UTC')->>'status', 'unavailable', 'snapshot without subject fails closed');
select is(public.record_mic_flow_completion('tz-repair', 'cold_take', 'tz-repair', 30, 30, 'UTC')->>'status', 'unavailable', 'completion without subject fails closed');
do $$ begin perform set_config('request.jwt.claim.sub', (select owner_id::text from timezone_repair_owners where label = 'a'), true); end $$;

select is(public.record_mic_flow_completion('tz-repair', 'cold_take', 'tz-repair', 30, 30, 'America/Indiana/Indianapolis')->>'status', 'credited', 'completion accepts multi-segment Indianapolis');
select is(public.get_mic_flow_snapshot('America/Indiana/Indianapolis')->>'status', 'protected_today', 'snapshot accepts requested and stored Indianapolis');
select is(public.get_mic_flow_snapshot('America/Indiana/Indianapolis')->>'timezone', 'America/Indiana/Indianapolis', 'stored timezone is preserved exactly');
select is(public.record_mic_flow_completion('tz-repair', 'cold_take', 'tz-repair', 30, 30, 'America/Indiana/Indianapolis')->>'status', 'already_credited', 'same-owner completion replay is idempotent');

select is(public.record_mic_flow_completion('tz-repair-next', 'cold_take', 'tz-repair', 30, 30, name)->>'status', 'same_day', 'completion accepts ordinary/second multi-segment zone ' || name)
from (values ('UTC'), ('America/Chicago'), ('America/Argentina/Buenos_Aires')) as zones(name);
select is(public.get_mic_flow_snapshot(name)->>'status', 'protected_today', 'snapshot accepts ordinary/second multi-segment zone ' || name)
from (values ('UTC'), ('America/Chicago'), ('America/Argentina/Buenos_Aires')) as zones(name);
select is(public.record_mic_flow_completion('tz-repair-symbol', 'cold_take', 'tz-repair', 30, 30, name)->>'status', 'same_day', 'completion accepts catalog plus-sign zone')
from pg_catalog.pg_timezone_names where name = 'Etc/GMT+5';
select is(public.get_mic_flow_snapshot(name)->>'status', 'protected_today', 'snapshot accepts catalog plus-sign zone')
from pg_catalog.pg_timezone_names where name = 'Etc/GMT+5';
select * from skip('running catalog lacks Etc/GMT+5', 2)
where not exists (select 1 from pg_catalog.pg_timezone_names where name = 'Etc/GMT+5');

select is(public.record_mic_flow_completion('tz-invalid', 'cold_take', 'tz-repair', 30, 30, name)->>'status', 'unavailable', 'completion rejects ' || label)
from (values
  ('America/Indiana/Indianapoliss', 'invalid lookalike'),
  ('', 'empty'), ('   ', 'blank'), (null, 'null'),
  ($input$UTC'; select 1; --$input$, 'injection-shaped input'),
  ('america/indiana/indianapolis', 'non-catalog case'),
  (' UTC', 'leading whitespace'), ('UTC ', 'trailing whitespace')
) as zones(name, label);
select is(public.get_mic_flow_snapshot(name)->>'status', 'unavailable', 'snapshot rejects ' || label)
from (values
  ('America/Indiana/Indianapoliss', 'invalid lookalike'),
  ('', 'empty'), ('   ', 'blank'), (null, 'null'),
  ($input$UTC'; select 1; --$input$, 'injection-shaped input'),
  ('america/indiana/indianapolis', 'non-catalog case'),
  (' UTC', 'leading whitespace'), ('UTC ', 'trailing whitespace')
) as zones(name, label);

reset role;
select is((select count(*) from public.mic_flow_completions where owner_id = (select owner_id from timezone_repair_owners where label = 'a')), 1::bigint, 'completion/replay/invalid calls yield exactly one completion row');
select is((select count(*) from public.mic_flow_state where owner_id = (select owner_id from timezone_repair_owners where label = 'a')), 1::bigint, 'completion creates exactly one owner state');
select is((select count(*) from public.mic_flow_completions where owner_id = (select owner_id from timezone_repair_owners where label = 'b')), 0::bigint, 'completion never writes the other owner');

create temporary table timezone_repair_before as
select (select jsonb_agg(to_jsonb(s) order by owner_id) from public.mic_flow_state s where owner_id in (select owner_id from timezone_repair_owners)) as states,
       (select jsonb_agg(to_jsonb(c) order by owner_id, completion_id) from public.mic_flow_completions c where owner_id in (select owner_id from timezone_repair_owners)) as completions;
set local role authenticated;
do $$ begin perform public.get_mic_flow_snapshot('America/Indiana/Indianapolis') from generate_series(1, 5); end $$;
reset role;
select is((select jsonb_agg(to_jsonb(s) order by owner_id) from public.mic_flow_state s where owner_id in (select owner_id from timezone_repair_owners)), (select states from timezone_repair_before), 'five snapshots preserve entire state rows');
select is((select jsonb_agg(to_jsonb(c) order by owner_id, completion_id) from public.mic_flow_completions c where owner_id in (select owner_id from timezone_repair_owners)), (select completions from timezone_repair_before), 'five snapshots preserve entire completion rows');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', (select owner_id::text from timezone_repair_owners where label = 'b'), true); end $$;
select is(public.get_mic_flow_snapshot('America/Indiana/Indianapolis')->>'status', 'not_started', 'second owner cannot read first owner state');
select is((select count(*) from public.mic_flow_state), 0::bigint, 'state RLS hides first owner');
select is(public.record_mic_flow_completion('tz-repair', 'cold_take', 'tz-repair', 30, 30, 'America/Argentina/Buenos_Aires')->>'status', 'credited', 'same completion identity remains separately owner-bound');
reset role;
select is((select count(*) from public.mic_flow_completions where owner_id in (select owner_id from timezone_repair_owners)), 2::bigint, 'each owner has exactly one completion');

set local role anon;
select throws_ok($$select public.get_mic_flow_snapshot('UTC')$$, '42501', null, 'anon snapshot execution remains rejected');
select throws_ok($$select public.record_mic_flow_completion('tz-repair', 'cold_take', 'tz-repair', 30, 30, 'UTC')$$, '42501', null, 'anon completion execution remains rejected');
reset role;
delete from auth.users where id in (select owner_id from timezone_repair_owners);
select is((select count(*) from public.mic_flow_state where owner_id in (select owner_id from timezone_repair_owners)), 0::bigint, 'fixture state cleanup is exact');
select is((select count(*) from public.mic_flow_completions where owner_id in (select owner_id from timezone_repair_owners)), 0::bigint, 'fixture completion cleanup is exact');
select * from finish();
rollback;
