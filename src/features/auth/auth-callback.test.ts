import { describe, expect, it } from '@jest/globals';

import { AUTH_CALLBACK_SUCCESS_HREF, parseAuthCallbackUrl } from './auth-callback';

describe('auth callback parsing', () => {
  it('parses a valid Supabase hash callback without exposing it in the result text', () => {
    expect(
      parseAuthCallbackUrl('http://localhost:8082/auth/callback#access_token=access-token&refresh_token=refresh-token&type=email_change'),
    ).toEqual({ kind: 'session', accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('rejects an invalid callback without a complete session payload', () => {
    expect(parseAuthCallbackUrl('http://localhost:8082/auth/callback?error=access_denied')).toEqual({
      kind: 'error',
      message: 'This verification link is invalid or expired.',
    });
    expect(parseAuthCallbackUrl('http://localhost:8082/auth/callback#access_token=access-token')).toEqual({
      kind: 'error',
      message: 'This verification link is invalid or expired.',
    });
  });

  it('handles a callback with no auth payload as an empty callback', () => {
    expect(parseAuthCallbackUrl('http://localhost:8082/auth/callback')).toEqual({ kind: 'empty' });
    expect(parseAuthCallbackUrl(null)).toEqual({ kind: 'empty' });
  });

  it('redirects a successful callback into the existing recovery flow', () => {
    expect(AUTH_CALLBACK_SUCCESS_HREF).toBe('/?auth=complete');
  });
});
