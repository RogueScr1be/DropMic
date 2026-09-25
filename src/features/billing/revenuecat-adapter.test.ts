import { describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { createRevenueCatAdapter } from './revenuecat-adapter';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

function session(id: string, anonymous = false) {
  return { user: { id, is_anonymous: anonymous } } as any;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function client(): any {
  return {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({ customerInfo: {}, created: false })),
    logOut: jest.fn(async () => ({})),
    getAppUserID: jest.fn(async () => userA),
    getOfferings: jest.fn(async (): Promise<unknown> => ({ current: { identifier: 'default' } })),
  };
}

describe('RevenueCat identity adapter', () => {
  it('leaves the SDK unconfigured for missing and anonymous sessions', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await expect(adapter.reconcileIdentity(null)).resolves.toEqual({ available: false, reason: 'missing_session' });
    await expect(adapter.reconcileIdentity(session(userA, true))).resolves.toEqual({ available: false, reason: 'anonymous_session' });
    expect(purchases.configure).not.toHaveBeenCalled();
    expect(purchases.logIn).not.toHaveBeenCalled();
    expect(adapter.isBillingAvailable()).toBe(false);
  });

  it('configures once with the exact permanent Supabase UUID', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await expect(adapter.reconcileIdentity(session(userA))).resolves.toEqual({ available: true });
    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.configure).toHaveBeenCalledWith({ apiKey: 'test_key', appUserID: userA });
  });

  it('serializes concurrent same-user reconciliation and configures once', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    const results = await Promise.all([adapter.reconcileIdentity(session(userA)), adapter.reconcileIdentity(session(userA))]);
    expect(results).toEqual([{ available: true }, { available: true }]);
    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.logIn).not.toHaveBeenCalled();
  });

  it('handles Strict Mode-style repeated lifecycle calls idempotently', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    await adapter.reconcileIdentity(session(userA));
    await adapter.reconcileIdentity(session(userA));
    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.logIn).not.toHaveBeenCalled();
  });

  it('switches permanent users directly with logIn and never logs out', async () => {
    const purchases = client();
    purchases.getAppUserID.mockResolvedValueOnce(userA).mockResolvedValue(userB);
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    await expect(adapter.reconcileIdentity(session(userB))).resolves.toEqual({ available: true });
    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.logIn).toHaveBeenCalledWith(userB);
    expect(purchases.logOut).not.toHaveBeenCalled();
  });

  it('does not call logOut and clears app-owned availability on sign-out', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    adapter.clearAppOwnedBillingAvailability();
    expect(adapter.isBillingAvailable()).toBe(false);
    expect(purchases.logOut).not.toHaveBeenCalled();
  });

  it('re-identifies the same user after sign-out with direct logIn', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    adapter.clearAppOwnedBillingAvailability();
    await expect(adapter.reconcileIdentity(session(userA))).resolves.toEqual({ available: true });
    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.logIn).toHaveBeenCalledWith(userA);
    expect(purchases.logOut).not.toHaveBeenCalled();
  });

  it('configures a later permanent sign-in when the process started signed out', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await expect(adapter.reconcileIdentity(null)).resolves.toEqual({ available: false, reason: 'missing_session' });
    await expect(adapter.reconcileIdentity(session(userA))).resolves.toEqual({ available: true });
    expect(purchases.configure).toHaveBeenCalledWith({ apiKey: 'test_key', appUserID: userA });
    expect(purchases.logIn).not.toHaveBeenCalled();
  });

  it('discards stale reconciliation after sign-out', async () => {
    const purchases = client();
    const identity = deferred<string>();
    purchases.getAppUserID.mockReturnValueOnce(identity.promise);
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    const pending = adapter.reconcileIdentity(session(userA));
    await Promise.resolve();
    adapter.clearAppOwnedBillingAvailability();
    identity.resolve(userA);

    await expect(pending).resolves.toEqual({ available: false, reason: 'stale_session' });
    expect(adapter.isBillingAvailable()).toBe(false);
  });

  it('discards stale reconciliation after switching from A to B', async () => {
    const purchases = client();
    const firstIdentity = deferred<string>();
    purchases.getAppUserID.mockReturnValueOnce(firstIdentity.promise).mockResolvedValue(userB);
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    const first = adapter.reconcileIdentity(session(userA));
    await Promise.resolve();
    const second = adapter.reconcileIdentity(session(userB));
    firstIdentity.resolve(userA);

    await expect(first).resolves.toEqual({ available: false, reason: 'stale_session' });
    await expect(second).resolves.toEqual({ available: true });
    expect(adapter.isBillingAvailable()).toBe(true);
    expect(purchases.logIn).toHaveBeenCalledWith(userB);
  });

  it('does not expose offerings for a missing, anonymous, or unmatched session', async () => {
    const purchases = client();
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    await expect(adapter.getTestStoreOfferings(session(userB))).resolves.toBeNull();
    await expect(adapter.getTestStoreOfferings(null)).resolves.toBeNull();
    await expect(adapter.getTestStoreOfferings(session(userA, true))).resolves.toBeNull();
    expect(purchases.getOfferings).not.toHaveBeenCalled();
  });

  it('discards stale offerings after sign-out', async () => {
    const purchases = client();
    const offerings = deferred<unknown>();
    purchases.getOfferings.mockReturnValueOnce(offerings.promise);
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    const pending = adapter.getTestStoreOfferings(session(userA));
    await Promise.resolve();
    adapter.clearAppOwnedBillingAvailability();
    offerings.resolve({ current: { identifier: 'default' } });

    await expect(pending).resolves.toBeNull();
  });

  it('discards stale offerings after switching from A to B', async () => {
    const purchases = client();
    const offerings = deferred<unknown>();
    purchases.getAppUserID.mockResolvedValueOnce(userA).mockResolvedValue(userB);
    purchases.getOfferings.mockReturnValueOnce(offerings.promise);
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    const pending = adapter.getTestStoreOfferings(session(userA));
    await Promise.resolve();
    await adapter.reconcileIdentity(session(userB));
    offerings.resolve({ current: { identifier: 'default' } });

    await expect(pending).resolves.toBeNull();
  });

  it('returns offerings only after post-await identity validation', async () => {
    const purchases = client();
    const offerings = deferred<unknown>();
    purchases.getOfferings.mockReturnValueOnce(offerings.promise);
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });

    await adapter.reconcileIdentity(session(userA));
    const pending = adapter.getTestStoreOfferings(session(userA));
    offerings.resolve({ current: { identifier: 'default' } });

    await expect(pending).resolves.toEqual({ current: { identifier: 'default' } });
  });

  it('fails closed for missing keys, unsupported platforms, and invalid users', async () => {
    const noKey = client();
    const noKeyAdapter = createRevenueCatAdapter({ client: noKey, platform: 'ios', apiKey: '' });
    await expect(noKeyAdapter.reconcileIdentity(session(userA))).resolves.toEqual({ available: false, reason: 'missing_api_key' });
    expect(noKey.configure).not.toHaveBeenCalled();

    const web = client();
    const webAdapter = createRevenueCatAdapter({ client: web, platform: 'unsupported', apiKey: 'test_key' });
    await expect(webAdapter.reconcileIdentity(session(userA))).resolves.toEqual({ available: false, reason: 'unsupported_platform' });
    expect(web.configure).not.toHaveBeenCalled();

    const invalid = client();
    const invalidAdapter = createRevenueCatAdapter({ client: invalid, platform: 'ios', apiKey: 'test_key' });
    await expect(invalidAdapter.reconcileIdentity(session('not-a-uuid'))).resolves.toEqual({ available: false, reason: 'invalid_user' });
  });

  it('purchases only a package from the current trusted offering', async () => {
    const purchases = client();
    const purchasePackage = jest.fn(async () => ({ customerInfo: {} }));
    purchases.purchasePackage = purchasePackage;
    purchases.getOfferings.mockResolvedValue({ current: { availablePackages: [{ identifier: 'annual' }] } });
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });
    await adapter.reconcileIdentity(session(userA));

    await expect(adapter.purchasePackage?.(session(userA), 'annual')).resolves.toEqual({ ok: true });
    expect(purchasePackage).toHaveBeenCalledWith({ identifier: 'annual' });
  });

  it('distinguishes a cancelled purchase from a failed purchase', async () => {
    const purchases = client();
    const cancellation = { code: 'PURCHASE_CANCELLED_ERROR' };
    purchases.purchasePackage = jest.fn(async () => { throw cancellation; });
    purchases.getOfferings.mockResolvedValue({ current: { availablePackages: [{ identifier: 'annual' }] } });
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });
    await adapter.reconcileIdentity(session(userA));

    await expect(adapter.purchasePackage?.(session(userA), 'annual')).resolves.toEqual({ ok: false, reason: 'purchase_cancelled' });
  });

  it('supports restore and fails closed when billing is unavailable', async () => {
    const purchases = client();
    purchases.restorePurchases = jest.fn(async () => ({ customerInfo: {} }));
    const adapter = createRevenueCatAdapter({ client: purchases, platform: 'ios', apiKey: 'test_key' });
    await adapter.reconcileIdentity(session(userA));
    await expect(adapter.restorePurchases?.(session(userA))).resolves.toEqual({ ok: true });
    adapter.clearAppOwnedBillingAvailability();
    await expect(adapter.restorePurchases?.(session(userA))).resolves.toEqual({ ok: false, reason: 'billing_unavailable' });
  });
});
