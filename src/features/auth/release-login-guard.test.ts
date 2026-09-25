import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

describe('development login release guard', () => {
  it('keeps the bypass behind __DEV__ and the explicit environment flag', () => {
    const source = readFileSync('src/features/auth/auth-service.ts', 'utf8');
    expect(source).toContain('__DEV__');
    expect(source).toContain('EXPO_PUBLIC_DROPMIC_DEV_TEST_LOGIN');
    expect(source).toContain("=== '1'");
  });

  it('does not embed a test credential in the auth service', () => {
    const source = readFileSync('src/features/auth/auth-service.ts', 'utf8');
    expect(source).not.toMatch(/password\s*[:=]\s*['"]/iu);
    expect(source).not.toMatch(/@example\.com/iu);
  });
});
