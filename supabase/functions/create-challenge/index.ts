import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { toPublicChallenge, type ChallengeDuration } from '../_shared/challenge-contract.ts';

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

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'not_configured' }, 503);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user || user.is_anonymous) return json({ error: 'auth_required' }, 401);

  const input = await request.json().catch(() => null) as { attemptId?: unknown; prompt?: unknown; category?: unknown; durationSeconds?: unknown; expiresInHours?: unknown } | null;
  const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
  const attemptId = typeof input?.attemptId === 'string' ? input.attemptId.trim() : '';
  const durationSeconds = input?.durationSeconds as ChallengeDuration;
  const expiresInHours = typeof input?.expiresInHours === 'number' && input.expiresInHours >= 1 && input.expiresInHours <= 168 ? input.expiresInHours : 72;
  if (!prompt || prompt.length > 500 || !/^[0-9a-f-]{36}$/iu.test(attemptId) || ![30, 60, 90].includes(durationSeconds)) return json({ error: 'invalid_input' }, 400);

  const admin = createClient(url, serviceKey);
  const { data: attempt, error: attemptError } = await admin.from('attempts').select('id').eq('id', attemptId).eq('owner_id', user.id).maybeSingle();
  if (attemptError || !attempt) return json({ error: 'attempt_not_owned' }, 403);
  const { count: recentCount, error: rateError } = await admin.from('challenge_links').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).gte('created_at', new Date(Date.now() - 60_000).toISOString());
  if (rateError) return json({ error: 'create_failed' }, 500);
  if ((recentCount ?? 0) >= 5) return json({ error: 'rate_limited' }, 429);

  const token = createToken();
  const now = new Date();
  const row = {
    owner_id: user.id,
    token_hash: await hashToken(token),
    prompt,
    category: typeof input?.category === 'string' ? input.category.trim().slice(0, 80) || null : null,
    duration_seconds: durationSeconds,
    expires_at: new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
  };
  const { data, error } = await admin.from('challenge_links').insert({ ...row, source_attempt_id: attempt.id }).select('prompt,category,duration_seconds,created_at,expires_at,status').single();
  if (error || !data) return json({ error: 'create_failed' }, 500);
  const challenge = toPublicChallenge(data, token);
  if (!challenge) return json({ error: 'create_failed' }, 500);
  return json({ token, challenge });
});
