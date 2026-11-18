import { describe, expect, it } from '@jest/globals';

import { canRetryFailedQuickRead } from '../../../supabase/functions/_shared/quick-read-retry';

const candidate = {
  status: 'failed',
  safeErrorCode: 'invalid_model_schema',
  audioCleanupStatus: 'pending',
  audioExpiresAt: '2026-11-08T18:00:00.000Z',
  retryCount: 0,
  manualRetryCount: 0,
  hasResult: false,
};

describe('explicit Quick Read retry boundary', () => {
  const now = new Date('2026-11-08T17:00:00.000Z');

  it('allows one explicit retry for an eligible failed analysis while audio remains available', () => {
    expect(canRetryFailedQuickRead(candidate, now)).toBe(true);
  });

  it.each([
    ['not failed', { status: 'completed' }],
    ['unapproved failure', { safeErrorCode: 'audio_cleanup_failed' }],
    ['audio deleted', { audioCleanupStatus: 'deleted' }],
    ['audio expired', { audioExpiresAt: '2026-11-08T16:59:59.000Z' }],
    ['retry budget spent', { retryCount: 2 }],
    ['manual retry already used', { manualRetryCount: 1 }],
    ['result already exists', { hasResult: true }],
  ])('rejects %s', (_label, override) => {
    expect(canRetryFailedQuickRead({ ...candidate, ...override } as typeof candidate, now)).toBe(false);
  });
});
