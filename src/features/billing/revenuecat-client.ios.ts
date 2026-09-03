import Purchases from 'react-native-purchases';

import type { RevenueCatClient } from './revenuecat-client.types';

export const revenueCatClientPlatform = 'ios' as const;
export const revenueCatClient = Purchases as unknown as RevenueCatClient;
