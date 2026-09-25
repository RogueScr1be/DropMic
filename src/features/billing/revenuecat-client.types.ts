export type RevenueCatClient = {
  configure: (configuration: { apiKey: string; appUserID: string }) => void;
  logIn: (appUserID: string) => Promise<unknown>;
  logOut?: () => Promise<unknown>;
  getAppUserID: () => Promise<string>;
  getOfferings: () => Promise<unknown>;
  purchasePackage?: (packageValue: unknown) => Promise<unknown>;
  restorePurchases?: () => Promise<unknown>;
  presentCustomerCenter?: () => Promise<void>;
};

export type RevenueCatClientPlatform = 'ios' | 'unsupported';
