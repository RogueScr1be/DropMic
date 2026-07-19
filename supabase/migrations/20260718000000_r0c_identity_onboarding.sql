-- UP

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_gate_confirmed_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.speaking_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goals text[] not null default '{}',
  blockers text[] not null default '{}',
  free_text_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_attempt_id text not null unique,
  topic_id text not null,
  selected_duration_seconds integer not null check (selected_duration_seconds in (30, 60, 90)),
  completed_duration_seconds integer not null check (completed_duration_seconds >= 0),
  completed_at timestamptz not null,
  audio_retained boolean not null default false check (audio_retained = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attempts_owner_id_idx on public.attempts (owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists speaking_preferences_set_updated_at on public.speaking_preferences;
create trigger speaking_preferences_set_updated_at
before update on public.speaking_preferences
for each row execute function public.set_updated_at();

drop trigger if exists attempts_set_updated_at on public.attempts;
create trigger attempts_set_updated_at
before update on public.attempts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.speaking_preferences enable row level security;
alter table public.attempts enable row level security;

revoke all on public.profiles, public.speaking_preferences, public.attempts from anon;
grant select, insert, update, delete on public.profiles, public.speaking_preferences, public.attempts to authenticated;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete on public.profiles
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists speaking_preferences_owner_select on public.speaking_preferences;
create policy speaking_preferences_owner_select on public.speaking_preferences
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists speaking_preferences_owner_insert on public.speaking_preferences;
create policy speaking_preferences_owner_insert on public.speaking_preferences
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists speaking_preferences_owner_update on public.speaking_preferences;
create policy speaking_preferences_owner_update on public.speaking_preferences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists speaking_preferences_owner_delete on public.speaking_preferences;
create policy speaking_preferences_owner_delete on public.speaking_preferences
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists attempts_owner_select on public.attempts;
create policy attempts_owner_select on public.attempts
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists attempts_owner_insert on public.attempts;
create policy attempts_owner_insert on public.attempts
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists attempts_owner_update on public.attempts;
create policy attempts_owner_update on public.attempts
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists attempts_owner_delete on public.attempts;
create policy attempts_owner_delete on public.attempts
for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- DOWN
-- drop function if exists public.delete_my_account();
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop table if exists public.attempts;
-- drop table if exists public.speaking_preferences;
-- drop table if exists public.profiles;
