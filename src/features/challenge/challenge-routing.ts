import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHALLENGE_PENDING_KEY = '@micdrop/challenge/pending';
export const CHALLENGE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const CANONICAL_HOST = 'thedropmic.com';
const CHALLENGE_TOKEN_PATTERN = /^[a-f0-9]{64}$/u;

export type ChallengeRoute = {
  token: string;
  source: 'https' | 'micdrop';
};

export type PendingChallenge = ChallengeRoute & {
  state: 'pending' | 'confirmed';
  updatedAt: number;
};

function decodeToken(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return CHALLENGE_TOKEN_PATTERN.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function parseChallengeUrl(value: string): ChallengeRoute | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.username || url.password || url.search || url.hash || url.port) {
    return null;
  }

  if (url.protocol === 'https:') {
    if (url.hostname !== CANONICAL_HOST) {
      return null;
    }
    const segments = url.pathname.split('/');
    if (segments.length !== 3 || segments[1] !== 'challenge' || !segments[2]) {
      return null;
    }
    const token = decodeToken(segments[2]);
    return token ? { source: 'https', token } : null;
  }

  if (url.protocol === 'micdrop:') {
    const segments = url.pathname.split('/');
    if (url.hostname !== 'challenge' || segments.length !== 2 || !segments[1]) {
      return null;
    }
    const token = decodeToken(segments[1]);
    return token ? { source: 'micdrop', token } : null;
  }

  return null;
}

export function buildNativeChallengeUrl(token: string) {
  if (!CHALLENGE_TOKEN_PATTERN.test(token)) {
    throw new Error('The challenge token is invalid.');
  }
  return `micdrop://challenge/${encodeURIComponent(token)}`;
}

function parsePending(raw: string | null): PendingChallenge | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<PendingChallenge>;
    if (
      (value.source !== 'https' && value.source !== 'micdrop') ||
      typeof value.token !== 'string' ||
      !CHALLENGE_TOKEN_PATTERN.test(value.token) ||
      (value.state !== 'pending' && value.state !== 'confirmed') ||
      typeof value.updatedAt !== 'number' ||
      !Number.isFinite(value.updatedAt)
    ) {
      return null;
    }
    return value as PendingChallenge;
  } catch {
    return null;
  }
}

export async function getPendingChallenge(now = Date.now()) {
  const pending = parsePending(await AsyncStorage.getItem(CHALLENGE_PENDING_KEY));
  if (!pending || now - pending.updatedAt > CHALLENGE_PENDING_TTL_MS) {
    if (pending) {
      await clearPendingChallenge();
    }
    return null;
  }
  return pending;
}

export async function savePendingChallenge(route: ChallengeRoute, state: PendingChallenge['state'] = 'pending') {
  const pending: PendingChallenge = { ...route, state, updatedAt: Date.now() };
  await AsyncStorage.setItem(CHALLENGE_PENDING_KEY, JSON.stringify(pending));
  return pending;
}

export async function confirmPendingChallenge(token: string) {
  const pending = await getPendingChallenge();
  if (!pending || pending.token !== token) {
    return null;
  }
  return savePendingChallenge(pending, 'confirmed');
}

export async function clearPendingChallenge() {
  await AsyncStorage.removeItem(CHALLENGE_PENDING_KEY);
}
