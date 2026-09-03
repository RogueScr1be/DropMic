import type { Session } from '@supabase/supabase-js';

import { revenueCatClient, revenueCatClientPlatform } from './revenuecat-client';
import type { RevenueCatClient, RevenueCatClientPlatform } from './revenuecat-client.types';

export const REVENUECAT_IOS_TEST_STORE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_TEST_STORE_KEY?.trim() ?? '';

type AdapterOptions = {
  client?: RevenueCatClient;
  platform?: RevenueCatClientPlatform;
  apiKey?: string;
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
  getTestStoreOfferings: (session: Session | null | undefined) => Promise<unknown | null>;
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

export function createRevenueCatAdapter(options: AdapterOptions = {}): RevenueCatAdapter {
  const client = options.client ?? revenueCatClient;
  const platform = options.platform ?? revenueCatClientPlatform;
  const apiKey = options.apiKey ?? REVENUECAT_IOS_TEST_STORE_KEY;
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

  const getTestStoreOfferings = async (session: Session | null | undefined) => {
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
      return offerings;
    } catch {
      return null;
    }
  };

  return {
    reconcileIdentity,
    clearAppOwnedBillingAvailability,
    getTestStoreOfferings,
    isBillingAvailable: () => billingAvailable,
  };
}

export const revenueCatAdapter = createRevenueCatAdapter();
