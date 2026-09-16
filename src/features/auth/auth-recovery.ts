import AsyncStorage from '@react-native-async-storage/async-storage';

export const UNCLAIMED_ATTEMPT_KEY = '@micdrop/r0c/unclaimed-attempt';
export const PENDING_AUTH_KEY = '@micdrop/r0c/pending-auth';
const LEGACY_PENDING_EMAIL_KEY = '@micdrop/r0c/pending-email';

export type PendingAuthIntent = 'anonymous-conversion' | 'existing-sign-in';

export type PendingAuth = {
  intent: PendingAuthIntent;
  email: string;
  anonymousUserId?: string;
  createdAt: number;
};

export type AuthFlowResumeStep = 'explanation' | 'otp' | 'sign_in_otp' | 'complete';

type AuthSessionIdentity = {
  user?: {
    is_anonymous?: boolean;
  };
} | null;

export type UnclaimedAttempt = {
  clientAttemptId: string;
  topicId: string;
  selectedDurationSeconds: 30 | 60 | 90;
  completedDurationSeconds: number;
  completedAt: string;
  audioRetained: false;
};

export function createClientAttemptId(nowMs = Date.now(), randomValue = Math.random()) {
  return `micdrop-${nowMs.toString(36)}-${Math.floor(randomValue * 0xffffff).toString(36)}`;
}

export async function saveUnclaimedAttempt(attempt: UnclaimedAttempt) {
  await AsyncStorage.setItem(UNCLAIMED_ATTEMPT_KEY, JSON.stringify(attempt));
}

export async function saveAndVerifyUnclaimedAttempt(attempt: UnclaimedAttempt) {
  await saveUnclaimedAttempt(attempt);
  const savedAttempt = await getUnclaimedAttempt();
  if (
    !savedAttempt ||
    savedAttempt.clientAttemptId !== attempt.clientAttemptId ||
    savedAttempt.topicId !== attempt.topicId ||
    savedAttempt.selectedDurationSeconds !== attempt.selectedDurationSeconds ||
    savedAttempt.completedDurationSeconds !== attempt.completedDurationSeconds ||
    savedAttempt.completedAt !== attempt.completedAt ||
    savedAttempt.audioRetained !== attempt.audioRetained
  ) {
    throw new Error('Local completion could not be verified.');
  }
  return savedAttempt;
}

export async function getUnclaimedAttempt(): Promise<UnclaimedAttempt | null> {
  const raw = await AsyncStorage.getItem(UNCLAIMED_ATTEMPT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const attempt = JSON.parse(raw) as Partial<UnclaimedAttempt>;
    if (
      typeof attempt.clientAttemptId !== 'string' ||
      typeof attempt.topicId !== 'string' ||
      ![30, 60, 90].includes(attempt.selectedDurationSeconds as number) ||
      typeof attempt.completedDurationSeconds !== 'number' ||
      typeof attempt.completedAt !== 'string'
    ) {
      return null;
    }
    return { ...attempt, audioRetained: false } as UnclaimedAttempt;
  } catch {
    return null;
  }
}

export async function clearUnclaimedAttempt() {
  await AsyncStorage.removeItem(UNCLAIMED_ATTEMPT_KEY);
}

export async function savePendingAuth(pendingAuth: PendingAuth) {
  await AsyncStorage.removeItem(LEGACY_PENDING_EMAIL_KEY);
  await AsyncStorage.setItem(PENDING_AUTH_KEY, JSON.stringify({
    ...pendingAuth,
    email: pendingAuth.email.trim().toLowerCase(),
  }));
}

export async function getPendingAuth(): Promise<PendingAuth | null> {
  const raw = await AsyncStorage.getItem(PENDING_AUTH_KEY);
  await AsyncStorage.removeItem(LEGACY_PENDING_EMAIL_KEY);
  if (!raw) {
    return null;
  }

  try {
    const pendingAuth = JSON.parse(raw) as Partial<PendingAuth>;
    if (
      (pendingAuth.intent !== 'anonymous-conversion' && pendingAuth.intent !== 'existing-sign-in') ||
      typeof pendingAuth.email !== 'string' ||
      !pendingAuth.email.includes('@') ||
      typeof pendingAuth.createdAt !== 'number' ||
      (pendingAuth.anonymousUserId !== undefined && typeof pendingAuth.anonymousUserId !== 'string')
    ) {
      return null;
    }
    return {
      ...pendingAuth,
      email: pendingAuth.email.trim().toLowerCase(),
    } as PendingAuth;
  } catch {
    return null;
  }
}

export async function clearPendingAuth() {
  await AsyncStorage.multiRemove([PENDING_AUTH_KEY, LEGACY_PENDING_EMAIL_KEY]);
}

export function authFlowResumeStep(session: AuthSessionIdentity, pendingAuth: PendingAuth | null): AuthFlowResumeStep {
  if (session?.user && session.user.is_anonymous === false) {
    return 'complete';
  }
  if (pendingAuth?.intent === 'existing-sign-in') {
    return 'sign_in_otp';
  }
  if (pendingAuth?.intent === 'anonymous-conversion') {
    return 'otp';
  }
  return 'explanation';
}
