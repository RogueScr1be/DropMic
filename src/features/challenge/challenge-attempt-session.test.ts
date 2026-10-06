import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it } from '@jest/globals';

import {
  CHALLENGE_ATTEMPT_SESSION_KEY,
  clearChallengeAttemptSession,
  getChallengeAttemptSession,
  markChallengeAcceptanceRecorded,
  saveChallengeAttemptSession,
  shouldPreserveChallengeAttemptOnBackground,
  shouldRecordChallengeAcceptance,
} from './challenge-attempt-session';

const token = 'challenge-token';
const identity = {
  clientAttemptId: 'attempt-1',
  quickReadIdempotencyKey: 'quick-read-1',
};

describe('challenge attempt session', () => {
  it('restores the same prompt, duration, attribution, and take identity', async () => {
    await clearChallengeAttemptSession();
    await saveChallengeAttemptSession({
      acceptanceRecorded: false,
      category: 'Perspective',
      durationSeconds: 30,
      identity,
      prompt: 'Describe a turning point.',
      token,
    }, 1000);

    await expect(getChallengeAttemptSession(token, 2000)).resolves.toEqual(expect.objectContaining({
      category: 'Perspective',
      durationSeconds: 30,
      identity,
      prompt: 'Describe a turning point.',
      token,
    }));
  });

  it('preserves challenge recording state across background pause without starting again', () => {
    expect(shouldPreserveChallengeAttemptOnBackground(true, 'recording')).toBe(true);
    expect(shouldPreserveChallengeAttemptOnBackground(true, 'paused')).toBe(true);
    expect(shouldPreserveChallengeAttemptOnBackground(true, 'completing')).toBe(true);
    expect(shouldPreserveChallengeAttemptOnBackground(false, 'recording')).toBe(false);
    expect(shouldPreserveChallengeAttemptOnBackground(true, 'countdown')).toBe(false);
  });

  it('records acceptance once and does not repeat it after restoration', async () => {
    await clearChallengeAttemptSession();
    await saveChallengeAttemptSession({
      acceptanceRecorded: false,
      category: 'Perspective',
      durationSeconds: 30,
      identity,
      prompt: 'Describe a turning point.',
      token,
    }, 1000);

    expect(shouldRecordChallengeAcceptance(true, false)).toBe(true);
    await expect(markChallengeAcceptanceRecorded(token, 2000)).resolves.toBe(true);
    expect(shouldRecordChallengeAcceptance(true, true)).toBe(false);
    await expect(markChallengeAcceptanceRecorded(token, 3000)).resolves.toBe(false);
    await expect(AsyncStorage.getItem(CHALLENGE_ATTEMPT_SESSION_KEY)).resolves.toContain('"acceptanceRecorded":true');
  });
});
