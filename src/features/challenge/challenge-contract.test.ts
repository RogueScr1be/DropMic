import { describe, expect, it } from '@jest/globals';

import {
  challengeShareText,
  containsPrivateChallengeData,
  toPublicChallenge,
} from '../../../supabase/functions/_shared/challenge-contract';

const row = {
  prompt: 'Tell a story about a small risk you took.',
  category: 'story',
  duration_seconds: 30,
  created_at: '2026-09-24T12:00:00.000Z',
  expires_at: '2026-09-27T12:00:00.000Z',
  status: 'active',
};

describe('challenge public contract', () => {
  it('exposes only the approved public fields and rejects expired rows', () => {
    expect(toPublicChallenge(row, 'opaque-token-12345678901234567890', new Date('2026-09-24T13:00:00.000Z'))).toEqual({
      token: 'opaque-token-12345678901234567890',
      prompt: row.prompt,
      category: 'story',
      durationSeconds: 30,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: 'active',
    });
    expect(toPublicChallenge({ ...row, expires_at: '2026-09-24T12:00:00.000Z' }, 'token', new Date('2026-09-24T13:00:00.000Z'))).toBeNull();
  });

  it('keeps share text free of private backend data', () => {
    const text = challengeShareText({ durationSeconds: 30, prompt: row.prompt }, 'https://dropmic.example/challenge/opaque-token');
    expect(text).toContain(row.prompt);
    expect(containsPrivateChallengeData(text)).toBe(true);
    expect(containsPrivateChallengeData(`${text} attempt_id=secret`)).toBe(false);
  });
});
