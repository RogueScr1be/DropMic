import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import type { RecordingDuration } from './recording-machine';

export const LOCAL_COMPLETED_TAKE_KEY = '@micdrop/d2/local-completed-take';
export const LOCAL_COMPLETED_TAKE_VERSION = 1;

export type LocalCompletedTake = {
  version: typeof LOCAL_COMPLETED_TAKE_VERSION;
  clientAttemptId: string;
  completedAt: string;
  completedDurationSeconds: number;
  localUri: string;
  ownerId: string;
  prompt: string;
  quickReadIdempotencyKey: string;
  selectedDurationSeconds: RecordingDuration;
  topicId: string;
};

type FileExists = (uri: string) => boolean | Promise<boolean>;

function isRecordingDuration(value: unknown): value is RecordingDuration {
  return value === 30 || value === 60 || value === 90;
}

function defaultFileExists(uri: string) {
  if (Platform.OS === 'web') {
    return uri.startsWith('blob:');
  }
  if (!uri.startsWith('file://')) {
    return false;
  }
  return new File(uri).exists;
}

function parseLocalCompletedTake(raw: string | null): LocalCompletedTake | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalCompletedTake>;
    if (
      parsed.version !== LOCAL_COMPLETED_TAKE_VERSION ||
      typeof parsed.clientAttemptId !== 'string' ||
      typeof parsed.quickReadIdempotencyKey !== 'string' ||
      typeof parsed.ownerId !== 'string' ||
      typeof parsed.localUri !== 'string' ||
      typeof parsed.topicId !== 'string' ||
      typeof parsed.prompt !== 'string' ||
      !isRecordingDuration(parsed.selectedDurationSeconds) ||
      typeof parsed.completedDurationSeconds !== 'number' ||
      typeof parsed.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.completedAt))
    ) {
      return null;
    }
    return parsed as LocalCompletedTake;
  } catch {
    return null;
  }
}

export async function saveLocalCompletedTake(take: LocalCompletedTake) {
  await AsyncStorage.setItem(LOCAL_COMPLETED_TAKE_KEY, JSON.stringify(take));
}

function completedTakeMatches(left: LocalCompletedTake, right: LocalCompletedTake) {
  return (
    left.version === right.version &&
    left.clientAttemptId === right.clientAttemptId &&
    left.completedAt === right.completedAt &&
    left.completedDurationSeconds === right.completedDurationSeconds &&
    left.localUri === right.localUri &&
    left.ownerId === right.ownerId &&
    left.prompt === right.prompt &&
    left.quickReadIdempotencyKey === right.quickReadIdempotencyKey &&
    left.selectedDurationSeconds === right.selectedDurationSeconds &&
    left.topicId === right.topicId
  );
}

export async function saveAndVerifyLocalCompletedTake(
  take: LocalCompletedTake,
  options: { fileExists?: FileExists } = {},
) {
  const existsBeforeWrite = await Promise.resolve((options.fileExists ?? defaultFileExists)(take.localUri));
  if (!existsBeforeWrite) {
    throw new Error('The completed recording file is not available to save.');
  }

  await saveLocalCompletedTake(take);
  const verified = await getLocalCompletedTake(take.ownerId, options);
  if (!verified || !completedTakeMatches(verified, take)) {
    throw new Error('The completed recording could not be verified after saving.');
  }
  return verified;
}

export async function getLocalCompletedTake(
  ownerId: string | null,
  options: { fileExists?: FileExists } = {},
): Promise<LocalCompletedTake | null> {
  if (!ownerId) {
    return null;
  }
  const take = parseLocalCompletedTake(await AsyncStorage.getItem(LOCAL_COMPLETED_TAKE_KEY));
  if (!take || take.ownerId !== ownerId) {
    return null;
  }
  const exists = await Promise.resolve((options.fileExists ?? defaultFileExists)(take.localUri));
  return exists ? take : null;
}

export async function clearLocalCompletedTake() {
  await AsyncStorage.removeItem(LOCAL_COMPLETED_TAKE_KEY);
}
