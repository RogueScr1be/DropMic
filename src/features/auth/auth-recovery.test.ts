import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  authFlowResumeStep,
  clearUnclaimedAttempt,
  createClientAttemptId,
  getPendingAuth,
  getUnclaimedAttempt,
  saveAndVerifyUnclaimedAttempt,
  savePendingAuth,
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
    const stored = JSON.parse((await AsyncStorage.getItem('@micdrop/r0c/unclaimed-attempt')) as string);
    expect(stored).not.toHaveProperty('audioUri');
    expect(stored).not.toHaveProperty('localUri');
  });

  it('verifies the saved attempt before exposing completion', async () => {
    const attempt = {
      clientAttemptId: 'client-verified',
      topicId: 'ordinary-voltage',
      selectedDurationSeconds: 60 as const,
      completedDurationSeconds: 42,
      completedAt: new Date(1000).toISOString(),
      audioRetained: false as const,
    };

    await expect(saveAndVerifyUnclaimedAttempt(attempt)).resolves.toEqual(attempt);
    await expect(getUnclaimedAttempt()).resolves.toEqual(attempt);
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

  it('stores an explicit pending auth intent for an unfinished OTP request', async () => {
    const pendingAuth = {
      intent: 'anonymous-conversion' as const,
      email: ' Person@Example.com ',
      anonymousUserId: 'anonymous-user-1',
      createdAt: 1000,
    };

    await savePendingAuth(pendingAuth);

    await expect(getPendingAuth()).resolves.toEqual({ ...pendingAuth, email: 'person@example.com' });
  });

  it('ignores and removes the legacy cached email state', async () => {
    await AsyncStorage.setItem('@micdrop/r0c/pending-email', 'stale@example.com');

    await expect(getPendingAuth()).resolves.toBeNull();
    await expect(AsyncStorage.getItem('@micdrop/r0c/pending-email')).resolves.toBeNull();
  });

  it('lets authenticated session truth override stale pending auth', () => {
    const pendingAuth = {
      intent: 'anonymous-conversion' as const,
      email: 'stale@example.com',
      createdAt: 1000,
    };

    expect(authFlowResumeStep({ user: { is_anonymous: false } }, pendingAuth)).toBe('onboarding');
    expect(authFlowResumeStep({ user: { is_anonymous: true } }, pendingAuth)).toBe('otp');
    expect(authFlowResumeStep(null, { ...pendingAuth, intent: 'existing-sign-in' })).toBe('sign_in_otp');
  });
});
