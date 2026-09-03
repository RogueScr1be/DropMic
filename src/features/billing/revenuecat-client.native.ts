import type { RevenueCatClient } from './revenuecat-client.types';

const unsupported = () => {
  throw new Error('RevenueCat billing is unavailable on this native platform.');
};

const unsupportedAsync = async () => {
  throw new Error('RevenueCat billing is unavailable on this native platform.');
};

export const revenueCatClientPlatform = 'unsupported' as const;
export const revenueCatClient: RevenueCatClient = {
  configure: unsupported,
  logIn: unsupportedAsync,
  getAppUserID: unsupportedAsync,
  getOfferings: unsupportedAsync,
};
