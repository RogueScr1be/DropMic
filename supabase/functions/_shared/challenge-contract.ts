export const CHALLENGE_DURATIONS = [30, 60, 90] as const;
export type ChallengeDuration = (typeof CHALLENGE_DURATIONS)[number];

export type PublicChallenge = {
  token: string;
  prompt: string;
  category: string | null;
  durationSeconds: ChallengeDuration;
  createdAt: string;
  expiresAt: string;
  status: 'active';
};

export function isChallengeDuration(value: unknown): value is ChallengeDuration {
  return CHALLENGE_DURATIONS.includes(value as ChallengeDuration);
}

export function toPublicChallenge(row: Record<string, unknown>, token: string, now = new Date()): PublicChallenge | null {
  if (
    typeof row.prompt !== 'string' ||
    row.prompt.trim() === '' ||
    (row.category !== null && typeof row.category !== 'string') ||
    !isChallengeDuration(row.duration_seconds) ||
    typeof row.created_at !== 'string' ||
    typeof row.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    !Number.isFinite(Date.parse(row.expires_at)) ||
    Date.parse(row.expires_at) <= now.getTime() ||
    row.status !== 'active'
  ) {
    return null;
  }
  return {
    token,
    prompt: row.prompt.trim(),
    category: typeof row.category === 'string' ? row.category.trim() || null : null,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: 'active',
  };
}

export function challengeShareText(challenge: Pick<PublicChallenge, 'prompt' | 'durationSeconds'>, url: string) {
  return `DropMic challenge: ${challenge.prompt}\nTake the ${challenge.durationSeconds}-second speaking challenge.\n${url}`;
}

export function containsPrivateChallengeData(value: string) {
  return !/(user[_-]?id|email|transcript|recording|access[_-]?token|attempt[_-]?id|storage)/iu.test(value);
}
