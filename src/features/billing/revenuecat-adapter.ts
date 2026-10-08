import type { Session } from '@supabase/supabase-js';

import { revenueCatClient, revenueCatClientPlatform } from './revenuecat-client';
import type { RevenueCatClient, RevenueCatClientPlatform } from './revenuecat-client.types';

export const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? '';
export const REVENUECAT_IOS_TEST_STORE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_TEST_STORE_KEY?.trim() ?? '';

export function selectRevenueCatIosApiKey(input: {
  productionKey: string | undefined;
  testStoreKey: string | undefined;
  isDevelopment: boolean;
}): string {
  const productionKey = input.productionKey?.trim() ?? '';
  if (productionKey) return productionKey;
  return input.isDevelopment ? input.testStoreKey?.trim() ?? '' : '';
}

type AdapterOptions = {
  client?: RevenueCatClient;
  platform?: RevenueCatClientPlatform;
  apiKey?: string;
  isDevelopment?: boolean;
};

export type RevenueCatIdentityResult =
  | { available: true }
  | {
      available: false;
      reason:
        | 'unsupported_platform'
        | 'missing_session'
        | 'anonymous_session'
        | 'invalid_user'
        | 'missing_api_key'
        | 'sdk_error'
        | 'stale_session';
    };

export type RevenueCatAdapter = {
  reconcileIdentity: (session: Session | null | undefined) => Promise<RevenueCatIdentityResult>;
  clearAppOwnedBillingAvailability: () => void;
  getOfferings: (session: Session | null | undefined, offeringIdentifier?: string) => Promise<unknown | null>;
  purchasePackage?: (session: Session | null | undefined, packageIdentifier: string, offeringIdentifier?: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  restorePurchases?: (session: Session | null | undefined) => Promise<{ ok: true } | { ok: false; reason: string }>;
  presentCustomerCenter?: () => Promise<boolean>;
  isBillingAvailable: () => boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function permanentUserId(session: Session | null | undefined): string | null {
  const user = session?.user;
  if (!user || user.is_anonymous === true || !UUID_PATTERN.test(user.id)) {
    return null;
  }
  return user.id;
}

function staleResult(): RevenueCatIdentityResult {
  return { available: false, reason: 'stale_session' };
}

function isPurchaseCancelled(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const detail = error as { code?: unknown; message?: unknown; userCancelled?: unknown };
  return detail.userCancelled === true ||
    (typeof detail.code === 'string' && /cancel/i.test(detail.code)) ||
    (typeof detail.message === 'string' && /cancel/i.test(detail.message));
}

export function createRevenueCatAdapter(options: AdapterOptions = {}): RevenueCatAdapter {
  const client = options.client ?? revenueCatClient;
  const platform = options.platform ?? revenueCatClientPlatform;
  const isDevelopment = options.isDevelopment ?? __DEV__;
  const apiKey = options.apiKey ?? selectRevenueCatIosApiKey({
    productionKey: REVENUECAT_IOS_API_KEY,
    testStoreKey: REVENUECAT_IOS_TEST_STORE_KEY,
    isDevelopment,
  });
  let configurationAttempted = false;
  let desiredPermanentUserId: string | null = null;
  let activeConfirmedUserId: string | null = null;
  let sdkUserId: string | null = null;
  let identityGeneration = 0;
  let billingAvailable = false;
  let identityQueue = Promise.resolve();

  const markUnavailable = () => {
    activeConfirmedUserId = null;
    billingAvailable = false;
  };

  const clearAppOwnedBillingAvailability = () => {
    identityGeneration += 1;
    desiredPermanentUserId = null;
    markUnavailable();
  };

  const isCurrentRequest = (generation: number, userId: string, session: Session) =>
    identityGeneration === generation &&
    desiredPermanentUserId === userId &&
    permanentUserId(session) === userId;

  const reconcileIdentity = (session: Session | null | undefined): Promise<RevenueCatIdentityResult> => {
    const requestedUserId = permanentUserId(session);
    const desiredChanged = desiredPermanentUserId !== requestedUserId;

    if (desiredChanged) {
      identityGeneration += 1;
      desiredPermanentUserId = requestedUserId;
      markUnavailable();
    }

    if (platform !== 'ios') {
      markUnavailable();
      return Promise.resolve({ available: false, reason: 'unsupported_platform' });
    }
    if (!session) {
      markUnavailable();
      return Promise.resolve({ available: false, reason: 'missing_session' });
    }
    if (session.user.is_anonymous === true) {
      markUnavailable();
      return Promise.resolve({ available: false, reason: 'anonymous_session' });
    }
    if (!requestedUserId) {
      markUnavailable();
      return Promise.resolve({ available: false, reason: 'invalid_user' });
    }
    if (!apiKey && !configurationAttempted) {
      markUnavailable();
      return Promise.resolve({ available: false, reason: 'missing_api_key' });
    }

    const generation = identityGeneration;
    const operation = identityQueue.then(async () => {
      if (!isCurrentRequest(generation, requestedUserId, session)) {
        return staleResult();
      }
      if (billingAvailable && activeConfirmedUserId === requestedUserId && sdkUserId === requestedUserId) {
        return { available: true } as const;
      }

      try {
        if (!configurationAttempted) {
          configurationAttempted = true;
          client.configure({ apiKey, appUserID: requestedUserId });
          if (!isCurrentRequest(generation, requestedUserId, session)) {
            return staleResult();
          }
          sdkUserId = requestedUserId;
        } else {
          await client.logIn(requestedUserId);
          if (!isCurrentRequest(generation, requestedUserId, session)) {
            return staleResult();
          }
          sdkUserId = requestedUserId;
        }

        const providerUserId = await client.getAppUserID();
        if (!isCurrentRequest(generation, requestedUserId, session)) {
          return staleResult();
        }
        if (providerUserId !== requestedUserId) {
          throw new Error('RevenueCat identity mismatch.');
        }
        activeConfirmedUserId = requestedUserId;
        billingAvailable = true;
        return { available: true } as const;
      } catch {
        if (!isCurrentRequest(generation, requestedUserId, session)) {
          return staleResult();
        }
        markUnavailable();
        return { available: false, reason: 'sdk_error' } as const;
      }
    });

    identityQueue = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const getOfferings = async (session: Session | null | undefined, offeringIdentifier?: string) => {
    const requestedUserId = permanentUserId(session);
    const generation = identityGeneration;
    if (
      platform !== 'ios' ||
      !session ||
      !requestedUserId ||
      !billingAvailable ||
      activeConfirmedUserId !== requestedUserId ||
      sdkUserId !== requestedUserId
    ) {
      return null;
    }
    try {
      const offerings = await client.getOfferings();
      if (
        identityGeneration !== generation ||
        desiredPermanentUserId !== requestedUserId ||
        permanentUserId(session) !== requestedUserId ||
        activeConfirmedUserId !== requestedUserId ||
        sdkUserId !== requestedUserId ||
        !billingAvailable
      ) {
        return null;
      }
      if (!offeringIdentifier) return offerings;
      const selectedOffering = (offerings as { all?: Record<string, unknown> } | null)?.all?.[offeringIdentifier];
      return selectedOffering ? { current: selectedOffering } : null;
    } catch {
      return null;
    }
  };

  const purchasePackage = async (session: Session | null | undefined, packageIdentifier: string, offeringIdentifier?: string) => {
    const requestedUserId = permanentUserId(session);
    const generation = identityGeneration;
    const operation = identityQueue.then(async () => {
      if (
        !requestedUserId || !session || !isCurrentRequest(generation, requestedUserId, session) ||
        !billingAvailable || activeConfirmedUserId !== requestedUserId || sdkUserId !== requestedUserId
      ) return { ok: false as const, reason: 'billing_unavailable' };

      const offerings = await getOfferings(session, offeringIdentifier);
      if (!offerings) return { ok: false as const, reason: 'product_unavailable' };
      const packages = (offerings as { current?: { availablePackages?: { identifier?: string }[] } } | null)?.current?.availablePackages ?? [];
      const selected = packages.find((item) => item.identifier === packageIdentifier);
      if (!selected || typeof client.purchasePackage !== 'function') {
        return { ok: false as const, reason: 'product_unavailable' };
      }
      if (!isCurrentRequest(generation, requestedUserId, session)) {
        return { ok: false as const, reason: 'billing_unavailable' };
      }
      try {
        await client.purchasePackage(selected);
        if (!isCurrentRequest(generation, requestedUserId, session) || sdkUserId !== requestedUserId) {
          return { ok: false as const, reason: 'billing_unavailable' };
        }
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, reason: isPurchaseCancelled(error) ? 'purchase_cancelled' : 'purchase_failed' };
      }
    });
    identityQueue = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const restorePurchases = async (session: Session | null | undefined) => {
    const requestedUserId = permanentUserId(session);
    const generation = identityGeneration;
    const operation = identityQueue.then(async () => {
      if (
        !requestedUserId || !session || !isCurrentRequest(generation, requestedUserId, session) ||
        !billingAvailable || sdkUserId !== requestedUserId || typeof client.restorePurchases !== 'function'
      ) return { ok: false as const, reason: 'billing_unavailable' };
      try {
        await client.restorePurchases();
        if (!isCurrentRequest(generation, requestedUserId, session) || sdkUserId !== requestedUserId) {
          return { ok: false as const, reason: 'billing_unavailable' };
        }
        return { ok: true as const };
      } catch {
        return { ok: false as const, reason: 'restore_failed' };
      }
    });
    identityQueue = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const presentCustomerCenter = async () => {
    if (!billingAvailable || typeof client.presentCustomerCenter !== 'function') {
      return false;
    }
    try {
      await client.presentCustomerCenter();
      return true;
    } catch {
      return false;
    }
  };

  return {
    reconcileIdentity,
    clearAppOwnedBillingAvailability,
    getOfferings,
    purchasePackage,
    restorePurchases,
    presentCustomerCenter,
    isBillingAvailable: () => billingAvailable,
  };
}

export const revenueCatAdapter = createRevenueCatAdapter();
