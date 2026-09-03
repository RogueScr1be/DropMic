export type RevenueCatClient = {
  configure: (configuration: { apiKey: string; appUserID: string }) => void;
  logIn: (appUserID: string) => Promise<unknown>;
  logOut?: () => Promise<unknown>;
  getAppUserID: () => Promise<string>;
  getOfferings: () => Promise<unknown>;
};

export type RevenueCatClientPlatform = 'ios' | 'unsupported';
