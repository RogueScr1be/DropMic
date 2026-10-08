import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import {
  createRevenueCatWebhookHandler,
  fetchRevenueCatSubscriberEntitlements,
} from '../_shared/revenuecat-webhook.ts';

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const handler = createRevenueCatWebhookHandler({
  authorization: Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION') ?? '',
  appId: Deno.env.get('REVENUECAT_APP_ID') ?? '',
  getSnapshot(ownerId) {
    return fetchRevenueCatSubscriberEntitlements(ownerId, requiredEnv('REVENUECAT_IOS_PUBLIC_API_KEY'));
  },
  async applySnapshot(event, result) {
    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.rpc('apply_revenuecat_entitlements_snapshot', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_at: event.occurredAt,
      p_owner_id: result.ownerId,
      p_entitlements: result.entitlements.map((entitlement) => ({
        entitlement_key: entitlement.entitlementKey,
        has_entitlement: entitlement.hasEntitlement,
        product_id: entitlement.snapshot?.productId ?? null,
        started_at: entitlement.snapshot?.startedAt ?? null,
        expires_at: entitlement.snapshot?.expiresAt ?? null,
        grace_expires_at: entitlement.snapshot?.graceExpiresAt ?? null,
        status: entitlement.snapshot?.status ?? null,
      })),
      p_snapshot_at: result.snapshotAt,
    });
    if (error) throw error;
  },
});

Deno.serve((request: Request) => handler(request));
