-- These pgTAP checks run with `supabase test db` against a local Supabase project.
begin;
select plan(12);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'speaking_preferences', 'speaking_preferences table exists');
select has_table('public', 'attempts', 'attempts table exists');
select col_is_pk('public', 'profiles', 'user_id', 'profiles is keyed by user_id');
select col_is_unique('public', 'attempts', 'client_attempt_id', 'client attempt ids are unique');
select policies_are('public', 'profiles', array['profiles_owner_delete', 'profiles_owner_insert', 'profiles_owner_select', 'profiles_owner_update'], 'profiles has owner policies');
select policies_are('public', 'speaking_preferences', array['speaking_preferences_owner_delete', 'speaking_preferences_owner_insert', 'speaking_preferences_owner_select', 'speaking_preferences_owner_update'], 'preferences has owner policies');
select policies_are('public', 'attempts', array['attempts_owner_delete', 'attempts_owner_insert', 'attempts_owner_select', 'attempts_owner_update'], 'attempts has owner policies');
select function_privs_are('public', 'delete_my_account', array['authenticated=EXECUTE'], 'account deletion is callable by authenticated users');
select col_default_is('public', 'attempts', 'audio_retained', 'false', 'audio retention defaults off');
select col_not_null('public', 'attempts', 'owner_id', 'attempts require an owner');
select col_not_null('public', 'attempts', 'completed_at', 'attempts require a completion time');

select * from finish();
rollback;
