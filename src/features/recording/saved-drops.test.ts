import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { LOCAL_COMPLETED_TAKE_KEY, LOCAL_COMPLETED_TAKE_VERSION, type LocalCompletedTake } from './local-completed-take';
import {
  clearSavedDrops,
  deleteSavedDrop,
  FREE_SAVED_DROP_LIMIT,
  getSavedDrops,
  SAVED_DROPS_KEY,
  saveAndVerifySavedDrop,
  SavedDropLimitError,
  type SavedDrop,
} from './saved-drops';

const base: LocalCompletedTake = {
  version: LOCAL_COMPLETED_TAKE_VERSION,
  clientAttemptId: 'client-1',
  completedAt: '2026-09-24T12:00:00.000Z',
  completedDurationSeconds: 30,
  localUri: 'file:///local/drop.m4a',
  ownerId: 'owner-1',
  prompt: 'What did you learn?',
  quickReadIdempotencyKey: 'quick-read-1',
  selectedDurationSeconds: 30,
  topicId: 'topic-1',
};

function drop(overrides: Partial<SavedDrop> = {}): SavedDrop {
  return { ...base, savedDropId: base.clientAttemptId, ...overrides };
}

describe('Saved Drop library', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('migrates the legacy single-take record into newest-first library storage', async () => {
    await AsyncStorage.setItem(LOCAL_COMPLETED_TAKE_KEY, JSON.stringify(base));

    await expect(getSavedDrops('owner-1', { fileExists: () => true })).resolves.toEqual([drop()]);
    await expect(AsyncStorage.getItem(SAVED_DROPS_KEY)).resolves.toContain('client-1');
  });

  it('keeps three free Drops and rejects the fourth without changing prior data', async () => {
    for (let index = 1; index <= FREE_SAVED_DROP_LIMIT; index += 1) {
      await saveAndVerifySavedDrop(drop({ savedDropId: `drop-${index}`, clientAttemptId: `client-${index}`, completedAt: `2026-09-24T12:0${index}:00.000Z` }), { fileExists: () => true });
    }

    await expect(saveAndVerifySavedDrop(drop({ savedDropId: 'drop-4', clientAttemptId: 'client-4' }), { fileExists: () => true })).rejects.toBeInstanceOf(SavedDropLimitError);
    await expect(getSavedDrops('owner-1', { fileExists: () => true })).resolves.toHaveLength(3);
  });

  it('allows Plus to retain beyond the free cap and supports deletion', async () => {
    for (let index = 1; index <= 4; index += 1) {
      await saveAndVerifySavedDrop(drop({ savedDropId: `drop-${index}`, clientAttemptId: `client-${index}` }), { fileExists: () => true, plus: true });
    }
    await expect(getSavedDrops('owner-1', { fileExists: () => true })).resolves.toHaveLength(4);
    await deleteSavedDrop('drop-2', 'owner-1');
    await expect(getSavedDrops('owner-1', { fileExists: () => true })).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ savedDropId: 'drop-2' })]));
  });

  it('keeps owners isolated in shared local storage', async () => {
    await saveAndVerifySavedDrop(drop(), { fileExists: () => true });
    await saveAndVerifySavedDrop(drop({ savedDropId: 'other', clientAttemptId: 'other-client', ownerId: 'owner-2' }), { fileExists: () => true });

    await expect(getSavedDrops('owner-1', { fileExists: () => true })).resolves.toEqual([drop()]);
    await expect(getSavedDrops('owner-2', { fileExists: () => true })).resolves.toEqual([expect.objectContaining({ ownerId: 'owner-2' })]);
  });

  it('clears only the launch library key', async () => {
    await AsyncStorage.setItem(SAVED_DROPS_KEY, JSON.stringify([drop()]));
    await clearSavedDrops();
    await expect(AsyncStorage.getItem(SAVED_DROPS_KEY)).resolves.toBeNull();
  });
});
