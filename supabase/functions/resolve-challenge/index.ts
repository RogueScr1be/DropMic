import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { toPublicChallenge } from '../_shared/challenge-contract.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not_configured' }, 503);
  const input = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof input?.token === 'string' && /^[a-f0-9]{64}$/u.test(input.token) ? input.token : null;
  if (!token) return json({ error: 'invalid' }, 400);
  const admin = createClient(url, serviceKey);
  const { data, error } = await admin.from('challenge_links').select('prompt,category,duration_seconds,created_at,expires_at,status').eq('token_hash', await hashToken(token)).maybeSingle();
  if (error || !data) return json({ error: 'invalid' }, 404);
  const challenge = toPublicChallenge(data, token);
  if (!challenge) return json({ error: data.status === 'active' ? 'expired' : 'disabled' }, 410);
  return json({ challenge });
});
