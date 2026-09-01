-- UP

-- R0F-B stores the provider's current Plus state only. Event history belongs
-- to the later webhook phase once there is a real event consumer.
create table if not exists public.billing_entitlements (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null check (entitlement_key = 'plus'),
  provider text not null check (provider = 'revenuecat'),
  product_id text not null,
  status text not null check (status in ('active', 'grace', 'expired', 'revoked')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  grace_expires_at timestamptz,
  last_event_id text not null,
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, entitlement_key),
  check (status <> 'grace' or grace_expires_at is not null),
  check (grace_expires_at is null or grace_expires_at >= expires_at)
);

drop trigger if exists billing_entitlements_set_updated_at on public.billing_entitlements;
create trigger billing_entitlements_set_updated_at
before update on public.billing_entitlements
for each row execute function public.set_updated_at();

alter table public.billing_entitlements enable row level security;

revoke all on public.billing_entitlements from anon, authenticated, public;
grant select on public.billing_entitlements to authenticated;
grant all on public.billing_entitlements to service_role;

drop policy if exists billing_entitlements_owner_select on public.billing_entitlements;
create policy billing_entitlements_owner_select on public.billing_entitlements
for select to authenticated
using ((select auth.uid()) = owner_id);
