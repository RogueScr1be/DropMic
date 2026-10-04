import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import { trackEvent } from '@/features/analytics/analytics';

import {
  challengeShareText,
  isChallengeDuration,
  type ChallengeDuration,
  type PublicChallenge,
} from '../../../supabase/functions/_shared/challenge-contract';

export class ChallengeServiceError extends Error {
  code: 'not_configured' | 'auth_required' | 'create_failed' | 'resolve_failed' | 'expired' | 'invalid' | 'creator_cannot_accept' | 'rotation_failed';

  constructor(message: string, code: ChallengeServiceError['code']) {
    super(message);
    this.name = 'ChallengeServiceError';
    this.code = code;
  }
}

const CANONICAL_CHALLENGE_WEB_ORIGIN = 'https://thedropmic.com';

function normalizeChallengeWebOrigin(origin: string) {
  let parsed: URL;
  try {
    parsed = new URL(origin.trim());
  } catch {
    throw new ChallengeServiceError('The challenge web origin is invalid.', 'invalid');
  }
  if (
    parsed.origin !== CANONICAL_CHALLENGE_WEB_ORIGIN ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new ChallengeServiceError('The challenge web origin is invalid.', 'invalid');
  }
  return CANONICAL_CHALLENGE_WEB_ORIGIN;
}

export const CHALLENGE_WEB_ORIGIN = normalizeChallengeWebOrigin(
  process.env.EXPO_PUBLIC_DROPMIC_WEB_ORIGIN?.trim() || CANONICAL_CHALLENGE_WEB_ORIGIN,
);

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new ChallengeServiceError('Challenge links are not configured yet.', 'not_configured');
  }
  return supabase;
}

export function buildChallengeUrl(token: string, origin = CHALLENGE_WEB_ORIGIN) {
  if (!token || !/^[A-Za-z0-9_-]{24,}$/u.test(token)) {
    throw new ChallengeServiceError('The challenge token is invalid.', 'invalid');
  }
  return `${normalizeChallengeWebOrigin(origin)}/challenge/${encodeURIComponent(token)}`;
}

export async function createChallenge(input: {
  attemptId: string;
  prompt: string;
  category?: string | null;
  durationSeconds: ChallengeDuration;
  expiresInHours?: number;
}) {
  const response = await client().functions.invoke('create-challenge', {
    body: {
      attemptId: input.attemptId,
      prompt: input.prompt,
      category: input.category ?? null,
      durationSeconds: input.durationSeconds,
      expiresInHours: input.expiresInHours ?? 72,
    },
  });
  const payload = response.data as { token?: unknown; challenge?: PublicChallenge; challengeId?: unknown } | null;
  if (response.error || !payload || typeof payload.token !== 'string' || !payload.challenge) {
    throw new ChallengeServiceError('Challenge link could not be created.', 'create_failed');
  }
  const url = buildChallengeUrl(payload.token);
  await trackEvent('challenge_link_created');
  return {
    ...payload.challenge,
    challengeId: typeof payload.challengeId === 'string' ? payload.challengeId : null,
    token: payload.token,
    url,
    shareText: challengeShareText(payload.challenge, url),
  };
}

export type OwnerChallenge = {
  id: string;
  attemptId: string;
  prompt: string;
  category: string | null;
  durationSeconds: ChallengeDuration;
  expiresAt: string;
};

export async function findActiveChallengeForAttempt(attemptId: string): Promise<OwnerChallenge | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(attemptId)) {
    throw new ChallengeServiceError('The saved Drop attempt is invalid.', 'invalid');
  }
  const result = await client()
    .from('challenge_links')
    .select('id,source_attempt_id,prompt,category,duration_seconds,expires_at,status')
    .eq('source_attempt_id', attemptId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (result.error) {
    throw new ChallengeServiceError('The existing challenge could not be verified.', 'resolve_failed');
  }
  const row = result.data as Record<string, unknown> | null;
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.source_attempt_id !== 'string' ||
    typeof row.prompt !== 'string' ||
    (row.category !== null && typeof row.category !== 'string') ||
    !isChallengeDuration(row.duration_seconds) ||
    typeof row.expires_at !== 'string' ||
    row.status !== 'active'
  ) {
    return null;
  }
  return {
    id: row.id,
    attemptId: row.source_attempt_id,
    prompt: row.prompt,
    category: typeof row.category === 'string' ? row.category : null,
    durationSeconds: row.duration_seconds,
    expiresAt: row.expires_at,
  };
}

export async function rotateChallengeLink(attemptId: string) {
  if (!/^[0-9a-f-]{36}$/iu.test(attemptId)) {
    throw new ChallengeServiceError('The saved Drop attempt is invalid.', 'invalid');
  }
  const response = await client().rpc('rotate_challenge_link', { p_attempt_id: attemptId });
  const payload = response.data as {
    status?: unknown;
    token?: unknown;
    challenge_id?: unknown;
    prompt?: unknown;
    category?: unknown;
    duration_seconds?: unknown;
    expires_at?: unknown;
  } | null;
  if (
    response.error ||
    payload?.status !== 'rotated' ||
    typeof payload.token !== 'string' ||
    typeof payload.challenge_id !== 'string' ||
    typeof payload.prompt !== 'string' ||
    (payload.category !== null && typeof payload.category !== 'string') ||
    !isChallengeDuration(payload.duration_seconds) ||
    typeof payload.expires_at !== 'string'
  ) {
    throw new ChallengeServiceError('The existing challenge link could not be regenerated.', 'rotation_failed');
  }
  const challenge = {
    challengeId: payload.challenge_id,
    prompt: payload.prompt,
    category: typeof payload.category === 'string' ? payload.category : null,
    durationSeconds: payload.duration_seconds,
    expiresAt: payload.expires_at,
    status: 'active' as const,
  };
  const url = buildChallengeUrl(payload.token);
  await trackEvent('challenge_link_rotated');
  return { ...challenge, token: payload.token, url, shareText: challengeShareText(challenge, url) };
}

export async function resolveChallenge(token: string) {
  const response = await client().functions.invoke('resolve-challenge', { body: { token } });
  const payload = response.data as { challenge?: PublicChallenge; error?: string } | null;
  if (response.error || !payload?.challenge) {
    const code = payload?.error === 'expired' ? 'expired' : 'resolve_failed';
    if (payload?.error === 'creator_cannot_accept') {
      throw new ChallengeServiceError('You cannot take your own challenge.', 'creator_cannot_accept');
    }
    throw new ChallengeServiceError(
      code === 'expired' ? 'This challenge has expired.' : 'This challenge is unavailable.',
      code,
    );
  }
  return payload.challenge;
}

export function challengeUrlForShare(challenge: Pick<PublicChallenge, 'token'>) {
  return buildChallengeUrl(challenge.token);
}
