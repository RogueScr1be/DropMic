import AsyncStorage from '@react-native-async-storage/async-storage';

export const UNCLAIMED_ATTEMPT_KEY = '@micdrop/r0c/unclaimed-attempt';
export const PENDING_EMAIL_KEY = '@micdrop/r0c/pending-email';

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

export async function savePendingEmail(email: string) {
  await AsyncStorage.setItem(PENDING_EMAIL_KEY, email.trim().toLowerCase());
}

export async function getPendingEmail() {
  return AsyncStorage.getItem(PENDING_EMAIL_KEY);
}

export async function clearPendingEmail() {
  await AsyncStorage.removeItem(PENDING_EMAIL_KEY);
}
