-- Additive challenge-response attribution. Raw challenge tokens never enter attempts.
create extension if not exists pgcrypto with schema extensions;

alter table public.attempts
  add column if not exists challenge_id uuid references public.challenge_links(id) on delete set null;

create index if not exists attempts_challenge_id_idx on public.attempts (challenge_id);

create or replace function public.assert_attempt_challenge_recipient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  challenge_owner uuid;
  challenge_status text;
  challenge_expires_at timestamptz;
begin
  if new.challenge_id is null then
    return new;
  end if;

  select owner_id, status, expires_at
    into challenge_owner, challenge_status, challenge_expires_at
  from public.challenge_links
  where id = new.challenge_id;

  if not found or challenge_status <> 'active' or challenge_expires_at <= clock_timestamp() then
    raise exception 'Challenge is unavailable' using errcode = '42501';
  end if;
  if challenge_owner = new.owner_id then
    raise exception 'Challenge creator cannot respond' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists attempts_challenge_recipient_guard on public.attempts;
create trigger attempts_challenge_recipient_guard
before insert or update of challenge_id on public.attempts
for each row execute function public.assert_attempt_challenge_recipient();

revoke all on function public.assert_attempt_challenge_recipient() from public, anon, authenticated;
grant execute on function public.assert_attempt_challenge_recipient() to service_role;

create or replace function public.claim_challenge_attempt(
  p_client_attempt_id text,
  p_topic_id text,
  p_selected_duration_seconds integer,
  p_completed_duration_seconds integer,
  p_completed_at timestamptz,
  p_challenge_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  challenge_row public.challenge_links%rowtype;
  attempt_id uuid;
  existing_owner uuid;
  existing_challenge_id uuid;
begin
  if current_user_id is null then
    return jsonb_build_object('status', 'auth_required');
  end if;
  if p_client_attempt_id is null or length(trim(p_client_attempt_id)) = 0
     or p_topic_id is null or length(trim(p_topic_id)) = 0
     or p_selected_duration_seconds not in (30, 60, 90)
     or p_completed_duration_seconds < 0
     or p_completed_at is null
     or p_challenge_token is null
     or p_challenge_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into challenge_row
  from public.challenge_links
  where token_hash = encode(extensions.digest(trim(p_challenge_token), 'sha256'), 'hex')
    and status = 'active'
    and expires_at > clock_timestamp();

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if challenge_row.owner_id = current_user_id then
    return jsonb_build_object('status', 'creator_cannot_accept');
  end if;

  select id, owner_id, challenge_id
    into attempt_id, existing_owner, existing_challenge_id
  from public.attempts
  where client_attempt_id = trim(p_client_attempt_id)
  for update;

  if found then
    if existing_owner <> current_user_id then
      return jsonb_build_object('status', 'unavailable');
    end if;
    if existing_challenge_id is not null and existing_challenge_id <> challenge_row.id then
      return jsonb_build_object('status', 'unavailable');
    end if;
    update public.attempts
      set challenge_id = challenge_row.id,
          topic_id = trim(p_topic_id),
          selected_duration_seconds = p_selected_duration_seconds,
          completed_duration_seconds = p_completed_duration_seconds,
          completed_at = p_completed_at
      where id = attempt_id;
  else
    insert into public.attempts (
      owner_id,
      client_attempt_id,
      topic_id,
      selected_duration_seconds,
      completed_duration_seconds,
      completed_at,
      audio_retained,
      challenge_id
    ) values (
      current_user_id,
      trim(p_client_attempt_id),
      trim(p_topic_id),
      p_selected_duration_seconds,
      p_completed_duration_seconds,
      p_completed_at,
      false,
      challenge_row.id
    )
    returning id into attempt_id;
  end if;

  return jsonb_build_object('status', 'claimed', 'attempt_id', attempt_id);
exception
  when unique_violation then
    return jsonb_build_object('status', 'unavailable');
end;
$$;

revoke all on function public.claim_challenge_attempt(text, text, integer, integer, timestamptz, text)
  from public, anon;
grant execute on function public.claim_challenge_attempt(text, text, integer, integer, timestamptz, text)
  to authenticated;
