import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import { fetchRevenueCatSubscriberSnapshot } from '../_shared/revenuecat-webhook.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization') ?? '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return json(401, { error: 'unauthorized' });

  try {
    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error || !data.user) return json(401, { error: 'unauthorized' });
    if (data.user.is_anonymous === true) return json(403, { error: 'permanent_account_required' });

    const ownerId = data.user.id;
    const snapshot = await fetchRevenueCatSubscriberSnapshot(ownerId, requiredEnv('REVENUECAT_IOS_PUBLIC_API_KEY'));
    const occurredAt = new Date().toISOString();
    const resolved = await admin.rpc('apply_revenuecat_entitlement_snapshot', {
      p_event_id: `sync:${crypto.randomUUID()}`,
      p_event_type: 'USER_SYNC',
      p_event_at: occurredAt,
      p_owner_id: ownerId,
      p_has_entitlement: snapshot.hasEntitlement,
      p_product_id: snapshot.hasEntitlement ? snapshot.snapshot.productId : null,
      p_started_at: snapshot.hasEntitlement ? snapshot.snapshot.startedAt : null,
      p_expires_at: snapshot.hasEntitlement ? snapshot.snapshot.expiresAt : null,
      p_grace_expires_at: snapshot.hasEntitlement ? snapshot.snapshot.graceExpiresAt : null,
      p_status: snapshot.hasEntitlement ? snapshot.snapshot.status : null,
      p_snapshot_at: snapshot.hasEntitlement ? snapshot.snapshot.snapshotAt : snapshot.snapshotAt,
    });
    if (resolved.error) return json(503, { error: 'billing_sync_unavailable' });
    return json(200, { synced: true });
  } catch {
    return json(503, { error: 'billing_sync_unavailable' });
  }
});
