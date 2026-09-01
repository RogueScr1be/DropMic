-- DOWN

drop trigger if exists billing_entitlements_set_updated_at on public.billing_entitlements;
drop table if exists public.billing_entitlements;
