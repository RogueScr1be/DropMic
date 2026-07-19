import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  clearUnclaimedAttempt,
  createClientAttemptId,
  getUnclaimedAttempt,
  saveUnclaimedAttempt,
} from './auth-recovery';

describe('local attempt recovery', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips metadata without a local audio URI', async () => {
    const attempt = {
      clientAttemptId: createClientAttemptId(1000, 0.5),
      topicId: 'ordinary-voltage',
      selectedDurationSeconds: 30 as const,
      completedDurationSeconds: 30,
      completedAt: new Date(1000).toISOString(),
      audioRetained: false as const,
    };

    await saveUnclaimedAttempt(attempt);

    await expect(getUnclaimedAttempt()).resolves.toEqual(attempt);
    expect(JSON.parse((await AsyncStorage.getItem('@micdrop/r0c/unclaimed-attempt')) as string)).not.toHaveProperty('audioUri');
  });

  it('clears recovery only when explicitly requested', async () => {
    await saveUnclaimedAttempt({
      clientAttemptId: 'client-1',
      topicId: 'topic-1',
      selectedDurationSeconds: 60,
      completedDurationSeconds: 12,
      completedAt: new Date(1000).toISOString(),
      audioRetained: false,
    });

    await clearUnclaimedAttempt();

    await expect(getUnclaimedAttempt()).resolves.toBeNull();
  });
});
