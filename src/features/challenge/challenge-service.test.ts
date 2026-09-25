import { describe, expect, it } from '@jest/globals';

import { buildChallengeUrl } from './challenge-service';

describe('challenge deep-link contract', () => {
  it('uses only the opaque token in native and web URLs', () => {
    const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(buildChallengeUrl(token, 'https://dropmic.example/')).toBe(`https://dropmic.example/challenge/${token}`);
    expect(buildChallengeUrl(token, '')).toBe(`micdrop://challenge/${token}`);
  });

  it('rejects short or identifier-shaped tokens', () => {
    expect(() => buildChallengeUrl('user-123')).toThrow('token is invalid');
    expect(() => buildChallengeUrl('')).toThrow('token is invalid');
  });
});
