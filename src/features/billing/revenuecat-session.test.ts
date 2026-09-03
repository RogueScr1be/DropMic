import { describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('./revenuecat-adapter', () => ({
  revenueCatAdapter: {
    reconcileIdentity: jest.fn(async () => ({ available: true })),
    clearAppOwnedBillingAvailability: jest.fn(),
    getTestStoreOfferings: jest.fn(async () => null),
    isBillingAvailable: jest.fn(() => false),
  },
}));

import { bindRevenueCatSession } from './revenuecat-session';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

function session(id: string) {
  return { user: { id, is_anonymous: false } } as any;
}

describe('RevenueCat session wiring', () => {
  it('passes the initial trusted session and auth callback sessions to the adapter', async () => {
    const reconcileIdentity = jest.fn(async () => ({ available: true as const }));
    const clearAppOwnedBillingAvailability = jest.fn();
    const adapter = {
      reconcileIdentity,
      clearAppOwnedBillingAvailability,
      getTestStoreOfferings: jest.fn(async () => null),
      isBillingAvailable: jest.fn(() => false),
    };
    let authCallback: ((event: string, currentSession: any) => void) | undefined;
    const unsubscribe = jest.fn();
    const authClient = {
      auth: {
        onAuthStateChange: jest.fn((callback: (event: string, currentSession: any) => void) => {
          authCallback = callback;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
    } as any;

    const cleanup = bindRevenueCatSession({
      adapter,
      authClient,
      configured: true,
      getCurrentSession: jest.fn(async () => session(userA)),
    });
    await Promise.resolve();
    expect(reconcileIdentity).toHaveBeenCalledWith(session(userA));

    authCallback?.('SIGNED_IN', session(userB));
    expect(reconcileIdentity).toHaveBeenCalledWith(session(userB));
    authCallback?.('SIGNED_OUT', null);
    expect(clearAppOwnedBillingAvailability).toHaveBeenCalledTimes(1);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(clearAppOwnedBillingAvailability).toHaveBeenCalledTimes(2);
  });

  it('does not subscribe when Supabase is unavailable and still clears app-owned state', () => {
    const adapter = {
      reconcileIdentity: jest.fn(async () => ({ available: true as const })),
      clearAppOwnedBillingAvailability: jest.fn(),
      getTestStoreOfferings: jest.fn(async () => null),
      isBillingAvailable: jest.fn(() => false),
    };

    const cleanup = bindRevenueCatSession({ adapter, authClient: null, configured: false, getCurrentSession: jest.fn(async () => null) });
    cleanup();
    expect(adapter.clearAppOwnedBillingAvailability).toHaveBeenCalledTimes(1);
  });
});
