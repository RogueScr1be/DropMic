import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TakeIdentity } from '@/features/quick-read/attempt-identity';
import type { RecordingDuration, RecordingState } from '@/features/recording/recording-machine';

export const CHALLENGE_ATTEMPT_SESSION_KEY = '@micdrop/challenge/attempt-session';
export const CHALLENGE_ATTEMPT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type ChallengeAttemptSession = {
  token: string;
  prompt: string;
  category: string;
  durationSeconds: RecordingDuration;
  identity: TakeIdentity;
  acceptanceRecorded: boolean;
  updatedAt: number;
};

function isRecordingDuration(value: unknown): value is RecordingDuration {
  return value === 30 || value === 60 || value === 90;
}

function parseSession(raw: string | null): ChallengeAttemptSession | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<ChallengeAttemptSession>;
    if (
      typeof value.token !== 'string' ||
      value.token.length === 0 ||
      typeof value.prompt !== 'string' ||
      value.prompt.length === 0 ||
      typeof value.category !== 'string' ||
      value.category.length === 0 ||
      !isRecordingDuration(value.durationSeconds) ||
      !value.identity ||
      typeof value.identity.clientAttemptId !== 'string' ||
      value.identity.clientAttemptId.length === 0 ||
      typeof value.identity.quickReadIdempotencyKey !== 'string' ||
      value.identity.quickReadIdempotencyKey.length === 0 ||
      typeof value.acceptanceRecorded !== 'boolean' ||
      typeof value.updatedAt !== 'number' ||
      !Number.isFinite(value.updatedAt)
    ) {
      return null;
    }
    return value as ChallengeAttemptSession;
  } catch {
    return null;
  }
}

export async function getChallengeAttemptSession(token: string, now = Date.now()) {
  const session = parseSession(await AsyncStorage.getItem(CHALLENGE_ATTEMPT_SESSION_KEY));
  if (!session || session.token !== token || now - session.updatedAt > CHALLENGE_ATTEMPT_SESSION_TTL_MS) {
    return null;
  }
  return session;
}

export async function saveChallengeAttemptSession(
  session: Omit<ChallengeAttemptSession, 'updatedAt'>,
  now = Date.now(),
) {
  const next: ChallengeAttemptSession = { ...session, updatedAt: now };
  await AsyncStorage.setItem(CHALLENGE_ATTEMPT_SESSION_KEY, JSON.stringify(next));
  return next;
}

export async function markChallengeAcceptanceRecorded(token: string, now = Date.now()) {
  const session = await getChallengeAttemptSession(token, now);
  if (!session || session.acceptanceRecorded) {
    return false;
  }
  await saveChallengeAttemptSession({ ...session, acceptanceRecorded: true }, now);
  return true;
}

export async function clearChallengeAttemptSession() {
  await AsyncStorage.removeItem(CHALLENGE_ATTEMPT_SESSION_KEY);
}

export function shouldPreserveChallengeAttemptOnBackground(
  challengeAttempt: boolean,
  recordingState: RecordingState,
) {
  return challengeAttempt && (recordingState === 'recording' || recordingState === 'paused' || recordingState === 'completing');
}

export function shouldRecordChallengeAcceptance(
  challengeConfirmed: boolean,
  acceptanceRecorded: boolean,
) {
  return challengeConfirmed && !acceptanceRecorded;
}
