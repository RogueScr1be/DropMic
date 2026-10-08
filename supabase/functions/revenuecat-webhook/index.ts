import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import {
  createRevenueCatWebhookHandler,
  fetchRevenueCatSubscriberSnapshot,
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
    return fetchRevenueCatSubscriberSnapshot(ownerId, requiredEnv('REVENUECAT_IOS_PUBLIC_API_KEY'));
  },
  async applySnapshot(event, result) {
    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const snapshot = result.hasEntitlement ? result.snapshot : null;
    const { error } = await admin.rpc('apply_revenuecat_entitlement_snapshot', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_at: event.occurredAt,
      p_owner_id: result.ownerId,
      p_has_entitlement: result.hasEntitlement,
      p_product_id: snapshot?.productId ?? null,
      p_started_at: snapshot?.startedAt ?? null,
      p_expires_at: snapshot?.expiresAt ?? null,
      p_grace_expires_at: snapshot?.graceExpiresAt ?? null,
      p_status: snapshot?.status ?? null,
      p_snapshot_at: result.hasEntitlement ? snapshot.snapshotAt : result.snapshotAt,
    });
    if (error) throw error;
  },
});

Deno.serve((request: Request) => handler(request));
