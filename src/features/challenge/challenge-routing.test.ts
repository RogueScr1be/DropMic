import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it } from '@jest/globals';

import {
  CHALLENGE_PENDING_KEY,
  CHALLENGE_PENDING_TTL_MS,
  buildNativeChallengeUrl,
  clearPendingChallenge,
  confirmPendingChallenge,
  getPendingChallenge,
  parseChallengeUrl,
  savePendingChallenge,
} from './challenge-routing';

const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('challenge routing', () => {
  it('accepts the canonical HTTPS and native challenge URLs', () => {
    expect(parseChallengeUrl(`https://thedropmic.com/challenge/${token}`)).toEqual({ source: 'https', token });
    expect(parseChallengeUrl(buildNativeChallengeUrl(token))).toEqual({ source: 'micdrop', token });
  });

  it('rejects unsafe hosts, schemes, URL components, and token shapes', () => {
    for (const value of [
      `http://thedropmic.com/challenge/${token}`,
      `https://www.thedropmic.com/challenge/${token}`,
      `https://evil.example/challenge/${token}`,
      `https://user:pass@thedropmic.com/challenge/${token}`,
      `https://thedropmic.com/challenge/${token}?token=${token}`,
      `https://thedropmic.com/challenge/${token}#fragment`,
      `https://thedropmic.com/challenge/${token}/extra`,
      `micdrop://challenge/${token}?token=${token}`,
      `micdrop://challenge/${token}#fragment`,
      `micdrop://other/${token}`,
      `https://thedropmic.com/challenge/not-a-token`,
    ]) {
      expect(parseChallengeUrl(value)).toBeNull();
    }
  });

  it('persists, confirms, and expires the minimum pending challenge state', async () => {
    await clearPendingChallenge();
    await savePendingChallenge({ source: 'https', token });
    expect(await getPendingChallenge()).toEqual(expect.objectContaining({ source: 'https', token, state: 'pending' }));
    await confirmPendingChallenge(token);
    expect(await getPendingChallenge()).toEqual(expect.objectContaining({ token, state: 'confirmed' }));
    expect(await getPendingChallenge(Date.now() + CHALLENGE_PENDING_TTL_MS + 1)).toBeNull();
    expect(await AsyncStorage.getItem(CHALLENGE_PENDING_KEY)).toBeNull();
  });
});
