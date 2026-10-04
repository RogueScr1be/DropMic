-- Rotate the public token for one existing owner challenge without creating a row.
alter table public.analytics_events
  drop constraint if exists analytics_events_event_name_check;

alter table public.analytics_events
  add constraint analytics_events_event_name_check check (event_name in (
    'app_opened', 'prompt_viewed', 'recording_started', 'recording_completed',
    'quick_read_requested', 'quick_read_completed', 'quick_read_failed',
    'share_card_generated', 'native_share_sheet_opened', 'challenge_link_created',
    'challenge_link_rotated', 'challenge_link_opened', 'challenge_accepted',
    'challenge_recording_completed', 'paywall_viewed', 'product_selected',
    'purchase_completed', 'purchase_cancelled', 'purchase_failed', 'restore_completed',
    'saved_drop_limit_reached'
  ));

create or replace function public.rotate_challenge_link(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, auth
as $$
declare
  caller_id uuid := auth.uid();
  caller_is_anonymous boolean;
  matching_count integer;
  challenge_row public.challenge_links%rowtype;
  raw_token text;
begin
  if caller_id is null or p_attempt_id is null then
    return jsonb_build_object('status', 'auth_required');
  end if;

  select coalesce(is_anonymous, false)
    into caller_is_anonymous
  from auth.users
  where id = caller_id;

  if caller_is_anonymous then
    return jsonb_build_object('status', 'auth_required');
  end if;

  select count(*)
    into matching_count
  from public.challenge_links
  where owner_id = caller_id
    and source_attempt_id = p_attempt_id
    and status = 'active'
    and expires_at > clock_timestamp();

  if matching_count = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  if matching_count > 1 then
    return jsonb_build_object('status', 'ambiguous');
  end if;

  select *
    into challenge_row
  from public.challenge_links
  where owner_id = caller_id
    and source_attempt_id = p_attempt_id
    and status = 'active'
    and expires_at > clock_timestamp()
  for update;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.challenge_links
  set token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
  where id = challenge_row.id;

  return jsonb_build_object(
    'status', 'rotated',
    'token', raw_token,
    'challenge_id', challenge_row.id,
    'prompt', challenge_row.prompt,
    'category', challenge_row.category,
    'duration_seconds', challenge_row.duration_seconds,
    'expires_at', challenge_row.expires_at
  );
end;
$$;

revoke all on function public.rotate_challenge_link(uuid) from public, anon;
grant execute on function public.rotate_challenge_link(uuid) to authenticated;
