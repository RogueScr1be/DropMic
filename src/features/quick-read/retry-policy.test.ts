import { describe, expect, it } from '@jest/globals';

import { nextProviderRetryCount } from '../../../supabase/functions/_shared/retry-policy';

describe('Quick Read retry policy', () => {
  it('allows exactly two transient retries', () => {
    expect(nextProviderRetryCount(0)).toBe(1);
    expect(nextProviderRetryCount(1)).toBe(2);
    expect(nextProviderRetryCount(2)).toBeNull();
  });
});
