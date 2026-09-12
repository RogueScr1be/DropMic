import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  clearLocalCompletedTake,
  getLocalCompletedTake,
  LOCAL_COMPLETED_TAKE_KEY,
  LOCAL_COMPLETED_TAKE_VERSION,
  saveAndVerifyLocalCompletedTake,
  saveLocalCompletedTake,
  type LocalCompletedTake,
} from './local-completed-take';

const take: LocalCompletedTake = {
  version: LOCAL_COMPLETED_TAKE_VERSION,
  clientAttemptId: 'client-1',
  completedAt: new Date(1000).toISOString(),
  completedDurationSeconds: 30,
  localUri: 'file:///local/drop.m4a',
  ownerId: 'owner-1',
  prompt: 'What did you learn?',
  quickReadIdempotencyKey: 'quick-read-1',
  selectedDurationSeconds: 30,
  topicId: 'topic-1',
};

describe('local completed take recovery', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('restores a same-owner local file that still exists', async () => {
    await saveLocalCompletedTake(take);

    await expect(getLocalCompletedTake('owner-1', { fileExists: () => true })).resolves.toEqual(take);
  });

  it('writes and reads back the URI-bearing take before treating it as retained', async () => {
    await expect(saveAndVerifyLocalCompletedTake(take, { fileExists: () => true })).resolves.toEqual(take);

    await expect(AsyncStorage.getItem(LOCAL_COMPLETED_TAKE_KEY)).resolves.toBe(JSON.stringify(take));
  });

  it('rejects persistence before claiming a take is saved when the local file is missing', async () => {
    await expect(saveAndVerifyLocalCompletedTake(take, { fileExists: () => false })).rejects.toThrow(
      'completed recording file is not available',
    );

    await expect(AsyncStorage.getItem(LOCAL_COMPLETED_TAKE_KEY)).resolves.toBeNull();
  });

  it('treats browser blob URLs as local retained recordings', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const blobTake = { ...take, localUri: 'blob:http://localhost/local-drop' };

    await expect(saveAndVerifyLocalCompletedTake(blobTake)).resolves.toEqual(blobTake);
  });

  it('does not use an unowned take as retained recovery proof', async () => {
    await saveLocalCompletedTake({ ...take, ownerId: '' });

    await expect(getLocalCompletedTake(null, { fileExists: () => true })).resolves.toBeNull();
    await expect(getLocalCompletedTake('owner-1', { fileExists: () => true })).resolves.toBeNull();
  });

  it('rejects persistence when immediate readback does not match the finalized take', async () => {
    const mismatch = { ...take, localUri: 'file:///other/drop.m4a' };
    jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key: string, value: string) => {
      await AsyncStorage.multiSet([[key, JSON.stringify(mismatch)]]);
      if (value.length === 0) {
        throw new Error('unreachable');
      }
    });

    await expect(saveAndVerifyLocalCompletedTake(take, { fileExists: () => true })).rejects.toThrow(
      'could not be verified',
    );
    await expect(getLocalCompletedTake('owner-1', { fileExists: () => true })).resolves.toEqual(mismatch);
  });

  it('reopens the same URI after a simulated relaunch', async () => {
    await saveLocalCompletedTake(take);

    const restoredAfterRelaunch = await getLocalCompletedTake('owner-1', { fileExists: () => true });

    expect(restoredAfterRelaunch?.localUri).toBe(take.localUri);
    expect(restoredAfterRelaunch?.clientAttemptId).toBe(take.clientAttemptId);
  });

  it('fails closed on owner mismatch', async () => {
    await saveLocalCompletedTake(take);

    await expect(getLocalCompletedTake('owner-2', { fileExists: () => true })).resolves.toBeNull();
  });

  it('fails closed when the local file is missing', async () => {
    await saveLocalCompletedTake(take);

    await expect(getLocalCompletedTake('owner-1', { fileExists: () => false })).resolves.toBeNull();
  });

  it('fails closed on malformed records', async () => {
    await AsyncStorage.setItem(LOCAL_COMPLETED_TAKE_KEY, JSON.stringify({ ...take, version: 999 }));

    await expect(getLocalCompletedTake('owner-1', { fileExists: () => true })).resolves.toBeNull();
  });

  it('clears only the local completed take record', async () => {
    await saveLocalCompletedTake(take);

    await clearLocalCompletedTake();

    await expect(AsyncStorage.getItem(LOCAL_COMPLETED_TAKE_KEY)).resolves.toBeNull();
  });
});
