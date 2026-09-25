import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import { trackEvent } from '@/features/analytics/analytics';

import {
  challengeShareText,
  type ChallengeDuration,
  type PublicChallenge,
} from '../../../supabase/functions/_shared/challenge-contract';

export const CHALLENGE_WEB_ORIGIN = process.env.EXPO_PUBLIC_DROPMIC_WEB_ORIGIN?.trim() ?? '';

export class ChallengeServiceError extends Error {
  code: 'not_configured' | 'auth_required' | 'create_failed' | 'resolve_failed' | 'expired' | 'invalid';

  constructor(message: string, code: ChallengeServiceError['code']) {
    super(message);
    this.name = 'ChallengeServiceError';
    this.code = code;
  }
}

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
  return origin ? `${origin.replace(/\/$/u, '')}/challenge/${token}` : `micdrop://challenge/${token}`;
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
  const payload = response.data as { token?: unknown; challenge?: PublicChallenge } | null;
  if (response.error || !payload || typeof payload.token !== 'string' || !payload.challenge) {
    throw new ChallengeServiceError('Challenge link could not be created.', 'create_failed');
  }
  const url = buildChallengeUrl(payload.token);
  await trackEvent('challenge_link_created');
  return { ...payload.challenge, token: payload.token, url, shareText: challengeShareText(payload.challenge, url) };
}

export async function resolveChallenge(token: string) {
  const response = await client().functions.invoke('resolve-challenge', { body: { token } });
  const payload = response.data as { challenge?: PublicChallenge; error?: string } | null;
  if (response.error || !payload?.challenge) {
    const code = payload?.error === 'expired' ? 'expired' : 'resolve_failed';
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
