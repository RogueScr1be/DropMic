-- Additive launch contracts. No recordings, transcripts, or owner identifiers
-- are public; challenge resolution is handled by the public Edge Function.
create table if not exists public.challenge_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_attempt_id uuid not null references public.attempts(id) on delete cascade,
  token_hash text not null unique,
  prompt text not null check (char_length(prompt) between 1 and 500),
  category text check (category is null or char_length(category) <= 80),
  duration_seconds integer not null check (duration_seconds in (30, 60, 90)),
  status text not null default 'active' check (status in ('active', 'disabled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  disabled_at timestamptz,
  created_ip_hash text
);

create index if not exists challenge_links_active_expiry_idx on public.challenge_links (status, expires_at);
create index if not exists challenge_links_owner_created_idx on public.challenge_links (owner_id, created_at);

create or replace function public.assert_challenge_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  attempt_owner uuid;
begin
  select owner_id into attempt_owner
  from public.attempts
  where id = new.source_attempt_id;
  if attempt_owner is null or new.owner_id <> attempt_owner then
    raise exception 'Challenge source attempt does not belong to challenge owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_links_owner_guard on public.challenge_links;
create trigger challenge_links_owner_guard
before insert or update on public.challenge_links
for each row execute function public.assert_challenge_owner();
revoke all on function public.assert_challenge_owner() from public, anon, authenticated;
grant execute on function public.assert_challenge_owner() to service_role;

alter table public.challenge_links enable row level security;
revoke all on public.challenge_links from anon, authenticated, public;
grant select, update, delete on public.challenge_links to authenticated;
grant all on public.challenge_links to service_role;

drop policy if exists challenge_links_owner_select on public.challenge_links;
create policy challenge_links_owner_select on public.challenge_links
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists challenge_links_owner_update on public.challenge_links;
create policy challenge_links_owner_update on public.challenge_links
for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists challenge_links_owner_delete on public.challenge_links;
create policy challenge_links_owner_delete on public.challenge_links
for delete to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete set null,
  event_name text not null check (event_name in (
    'app_opened', 'prompt_viewed', 'recording_started', 'recording_completed',
    'quick_read_requested', 'quick_read_completed', 'quick_read_failed',
    'share_card_generated', 'native_share_sheet_opened', 'challenge_link_created',
    'challenge_link_opened', 'challenge_accepted', 'challenge_recording_completed',
    'paywall_viewed', 'product_selected', 'purchase_completed', 'purchase_cancelled',
    'purchase_failed', 'restore_completed', 'saved_drop_limit_reached'
  )),
  event_key text not null unique,
  occurred_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated, public;
grant insert on public.analytics_events to anon, authenticated;
grant all on public.analytics_events to service_role;

drop policy if exists analytics_events_insert_safe on public.analytics_events;
create policy analytics_events_insert_safe on public.analytics_events
for insert to anon, authenticated
with check (
  owner_id is null and
  char_length(event_key) between 1 and 160 and
  occurred_at between now() - interval '2 days' and now() + interval '5 minutes'
);
