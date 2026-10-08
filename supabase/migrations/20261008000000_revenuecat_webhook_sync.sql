-- RevenueCat is the source of truth; this migration stores only the
-- idempotency envelope and the latest provider snapshot, never raw payloads.

alter table public.billing_entitlements
  add column if not exists provider_snapshot_at timestamptz not null default '-infinity'::timestamptz;

create table if not exists public.revenuecat_webhook_events (
  event_id text not null check (length(trim(event_id)) between 1 and 200),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (length(trim(event_type)) between 1 and 100),
  event_at timestamptz not null,
  processed_at timestamptz not null default now(),
  primary key (event_id, owner_id)
);

alter table public.revenuecat_webhook_events enable row level security;
revoke all on public.revenuecat_webhook_events from anon, authenticated, public;
grant all on public.revenuecat_webhook_events to service_role;

create or replace function public.apply_revenuecat_entitlement_snapshot(
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_owner_id uuid,
  p_has_entitlement boolean,
  p_product_id text,
  p_started_at timestamptz,
  p_expires_at timestamptz,
  p_grace_expires_at timestamptz,
  p_status text,
  p_snapshot_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_event_id text;
  current_snapshot_at timestamptz;
begin
  if p_event_id is null or length(trim(p_event_id)) not between 1 and 200
     or p_event_type is null or length(trim(p_event_type)) not between 1 and 100
     or p_event_at is null or p_owner_id is null or p_snapshot_at is null
     or p_has_entitlement is null then
    raise exception 'invalid RevenueCat event envelope';
  end if;

  if p_has_entitlement and (
    p_product_id is null or length(trim(p_product_id)) not between 1 and 200
    or p_started_at is null or p_expires_at is null
    or p_status is null or p_status not in ('active', 'grace', 'expired')
    or (p_status = 'active' and p_expires_at <= p_snapshot_at)
    or (p_status = 'grace' and (p_grace_expires_at is null or p_grace_expires_at <= p_snapshot_at))
  ) then
    raise exception 'invalid RevenueCat entitlement snapshot';
  end if;

  if not exists (select 1 from auth.users where id = p_owner_id) then
    return 'unknown_owner';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':plus', 0)
  );

  insert into public.revenuecat_webhook_events (event_id, owner_id, event_type, event_at)
  values (trim(p_event_id), p_owner_id, trim(p_event_type), p_event_at)
  on conflict (event_id, owner_id) do nothing
  returning event_id into inserted_event_id;

  if inserted_event_id is null then
    return 'duplicate';
  end if;

  select provider_snapshot_at into current_snapshot_at
  from public.billing_entitlements
  where owner_id = p_owner_id and entitlement_key = 'plus'
  for update;

  if found and current_snapshot_at >= p_snapshot_at then
    return 'stale';
  end if;

  if p_has_entitlement then
    insert into public.billing_entitlements (
      owner_id, entitlement_key, provider, product_id, status,
      started_at, expires_at, grace_expires_at,
      last_event_id, last_event_at, provider_snapshot_at
    ) values (
      p_owner_id, 'plus', 'revenuecat', trim(p_product_id), p_status,
      p_started_at, p_expires_at, p_grace_expires_at,
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
    return 'updated';
  end if;

  update public.billing_entitlements
  set status = 'expired',
      grace_expires_at = null,
      last_event_id = trim(p_event_id),
      last_event_at = p_event_at,
      provider_snapshot_at = p_snapshot_at
  where owner_id = p_owner_id and entitlement_key = 'plus';

  if found then return 'expired'; end if;
  return 'no_entitlement';
end;
$$;

revoke all on function public.apply_revenuecat_entitlement_snapshot(
  text, text, timestamptz, uuid, boolean, text, timestamptz, timestamptz,
  timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement_snapshot(
  text, text, timestamptz, uuid, boolean, text, timestamptz, timestamptz,
  timestamptz, text, timestamptz
) to service_role;
