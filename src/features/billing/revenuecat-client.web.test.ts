import { describe, expect, it } from '@jest/globals';

import { revenueCatClient, revenueCatClientPlatform } from './revenuecat-client.web';

describe('web RevenueCat client boundary', () => {
  it('is an unsupported fail-closed client with no native SDK calls', async () => {
    expect(revenueCatClientPlatform).toBe('unsupported');
    expect(() => revenueCatClient.configure({ apiKey: 'test_key', appUserID: 'user-id' })).toThrow(
      'unavailable on this platform',
    );
    await expect(revenueCatClient.getOfferings()).rejects.toThrow('unavailable on this platform');
  });
});
