import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import { resolveEntitlementAccess } from '../_shared/entitlement.ts';
import { getSkillPack } from '../_shared/skill-pack-content.ts';

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
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return json(401, { error: 'unauthorized' });
    if (authData.user.is_anonymous === true) return json(403, { error: 'permanent_account_required' });

    const body = await request.json().catch(() => null) as { packId?: unknown } | null;
    const packId = typeof body?.packId === 'string' ? body.packId : '';
    const pack = getSkillPack(packId);
    if (!pack) return json(404, { error: 'skill_pack_not_found' });

    const fields = 'entitlement_key,provider,product_id,status,started_at,expires_at,grace_expires_at,last_event_id,last_event_at,created_at,updated_at';
    const { data: rows, error } = await admin
      .from('billing_entitlements')
      .select(fields)
      .eq('owner_id', authData.user.id)
      .in('entitlement_key', [pack.entitlementKey, 'plus']);
    if (error) return json(503, { error: 'billing_state_unavailable' });

    const packRow = rows?.find((row) => row.entitlement_key === pack.entitlementKey);
    if (!resolveEntitlementAccess(packRow, pack.entitlementKey).allowed) {
      return json(403, { error: 'skill_pack_not_owned' });
    }
    const plusRow = rows?.find((row) => row.entitlement_key === 'plus');
    const plusActive = resolveEntitlementAccess(plusRow, 'plus').allowed;

    return json(200, {
      pack: {
        id: pack.id,
        prompts: pack.prompts,
        drills: pack.drills,
        terminology: pack.terminology,
        pressureTest: pack.pressureTest,
        quickReadGuidance: pack.quickReadGuidance,
        advancedRubric: plusActive ? pack.advancedRubric : null,
      },
    });
  } catch {
    return json(503, { error: 'skill_pack_unavailable' });
  }
});
