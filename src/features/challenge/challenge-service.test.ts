import { describe, expect, it } from '@jest/globals';

import { buildChallengeUrl } from './challenge-service';

describe('challenge deep-link contract', () => {
  it('uses the canonical HTTPS web origin and only the opaque token', () => {
    const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(buildChallengeUrl(token)).toBe(`https://thedropmic.com/challenge/${token}`);
    expect(buildChallengeUrl(token, 'https://thedropmic.com/')).toBe(`https://thedropmic.com/challenge/${token}`);
  });

  it('rejects short or identifier-shaped tokens', () => {
    expect(() => buildChallengeUrl('user-123')).toThrow('token is invalid');
    expect(() => buildChallengeUrl('')).toThrow('token is invalid');
  });

  it('rejects reserved token characters instead of allowing path escape', () => {
    const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(() => buildChallengeUrl(`${token}/../?next=private`)).toThrow('token is invalid');
  });

  it('fails closed for non-HTTPS, wrong-host, and unexpected-origin inputs', () => {
    const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    for (const origin of [
      'http://thedropmic.com',
      'https://www.thedropmic.com',
      'https://evil.example',
      'https://thedropmic.com/app',
      'https://user:pass@thedropmic.com',
      'https://thedropmic.com?redirect=evil',
    ]) {
      expect(() => buildChallengeUrl(token, origin)).toThrow('web origin is invalid');
    }
  });

  it('does not add a query string or fragment', () => {
    const url = buildChallengeUrl('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789');
    expect(new URL(url).search).toBe('');
    expect(new URL(url).hash).toBe('');
  });
});
