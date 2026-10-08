-- Extend the existing RevenueCat mirror to permanent, separately owned Packs.
-- RevenueCat remains authoritative; this migration stores only current state
-- and the minimal webhook idempotency envelope.

alter table public.billing_entitlements
  drop constraint if exists billing_entitlements_entitlement_key_check;

alter table public.billing_entitlements
  add constraint billing_entitlements_entitlement_key_check
  check (entitlement_key in ('plus', 'pack.interview_pro', 'pack.founder_pitch'));

create or replace function public.apply_revenuecat_entitlements_snapshot(
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_owner_id uuid,
  p_entitlements jsonb,
  p_snapshot_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_event_id text;
  item jsonb;
  item_key text;
  item_has_entitlement boolean;
  current_snapshot_at timestamptz;
  item_status text;
  item_expires_at timestamptz;
  item_grace_expires_at timestamptz;
begin
  if p_event_id is null or length(trim(p_event_id)) not between 1 and 200
     or p_event_type is null or length(trim(p_event_type)) not between 1 and 100
     or p_event_at is null or p_owner_id is null or p_snapshot_at is null
     or jsonb_typeof(p_entitlements) <> 'array'
     or jsonb_array_length(p_entitlements) <> 3 then
    raise exception 'invalid RevenueCat entitlement snapshot envelope';
  end if;

  if (
    select count(distinct value->>'entitlement_key')
    from jsonb_array_elements(p_entitlements)
  ) <> 3 or exists (
    select 1
    from jsonb_array_elements(p_entitlements) as entry(value)
    where value->>'entitlement_key' not in ('plus', 'pack.interview_pro', 'pack.founder_pitch')
       or jsonb_typeof(value->'has_entitlement') <> 'boolean'
  ) then
    raise exception 'invalid RevenueCat entitlement keys';
  end if;

  if not exists (select 1 from auth.users where id = p_owner_id) then
    return 'unknown_owner';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':billing_entitlements', 0)
  );

  insert into public.revenuecat_webhook_events (event_id, owner_id, event_type, event_at)
  values (trim(p_event_id), p_owner_id, trim(p_event_type), p_event_at)
  on conflict (event_id, owner_id) do nothing
  returning event_id into inserted_event_id;

  if inserted_event_id is null then
    return 'duplicate';
  end if;

  for item in select value from jsonb_array_elements(p_entitlements)
  loop
    item_key := item->>'entitlement_key';
    item_has_entitlement := (item->>'has_entitlement')::boolean;

    select provider_snapshot_at into current_snapshot_at
    from public.billing_entitlements
    where owner_id = p_owner_id and entitlement_key = item_key
    for update;

    if found and current_snapshot_at >= p_snapshot_at then
      continue;
    end if;

    if not item_has_entitlement then
      update public.billing_entitlements
      set status = 'expired',
          grace_expires_at = null,
          last_event_id = trim(p_event_id),
          last_event_at = p_event_at,
          provider_snapshot_at = p_snapshot_at
      where owner_id = p_owner_id and entitlement_key = item_key;
      continue;
    end if;

    item_status := item->>'status';
    item_expires_at := (item->>'expires_at')::timestamptz;
    item_grace_expires_at := nullif(item->>'grace_expires_at', '')::timestamptz;

    if item->>'product_id' is null or length(trim(item->>'product_id')) not between 1 and 200
       or nullif(item->>'started_at', '') is null or item_expires_at is null
       or item_status is null or item_status not in ('active', 'grace', 'expired')
       or (item_status = 'active' and item_expires_at <= p_snapshot_at)
       or (item_status = 'grace' and (item_grace_expires_at is null or item_grace_expires_at <= p_snapshot_at)) then
      raise exception 'invalid RevenueCat entitlement state';
    end if;

    insert into public.billing_entitlements (
      owner_id, entitlement_key, provider, product_id, status,
      started_at, expires_at, grace_expires_at,
      last_event_id, last_event_at, provider_snapshot_at
    ) values (
      p_owner_id, item_key, 'revenuecat', trim(item->>'product_id'), item_status,
      (item->>'started_at')::timestamptz, item_expires_at, item_grace_expires_at,
      trim(p_event_id), p_event_at, p_snapshot_at
    )
    on conflict (owner_id, entitlement_key) do update set
      product_id = excluded.product_id,
      status = excluded.status,
      started_at = excluded.started_at,
      expires_at = excluded.expires_at,
      grace_expires_at = excluded.grace_expires_at,
      last_event_id = excluded.last_event_id,
      last_event_at = excluded.last_event_at,
      provider_snapshot_at = excluded.provider_snapshot_at;
  end loop;

  return 'updated';
end;
$$;

revoke all on function public.apply_revenuecat_entitlements_snapshot(
  text, text, timestamptz, uuid, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlements_snapshot(
  text, text, timestamptz, uuid, jsonb, timestamptz
) to service_role;
