import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import { getSession } from '@/features/auth/auth-service';

import { revenueCatAdapter, type RevenueCatAdapter } from './revenuecat-adapter';

type SessionAuthClient = Pick<SupabaseClient, 'auth'>;

export type RevenueCatSessionBridgeDependencies = {
  adapter?: RevenueCatAdapter;
  authClient?: SessionAuthClient | null;
  configured?: boolean;
  getCurrentSession?: () => Promise<Session | null>;
};

export function bindRevenueCatSession(dependencies: RevenueCatSessionBridgeDependencies = {}) {
  const adapter = dependencies.adapter ?? revenueCatAdapter;
  const authClient = dependencies.authClient === undefined ? supabase : dependencies.authClient;
  const configured = dependencies.configured ?? isSupabaseConfigured;
  const getCurrentSession = dependencies.getCurrentSession ?? getSession;
  let disposed = false;

  const reconcile = (session: Session | null) => {
    if (disposed) {
      return;
    }
    if (!session) {
      adapter.clearAppOwnedBillingAvailability();
      return;
    }
    void adapter.reconcileIdentity(session);
  };

  void getCurrentSession().then(reconcile).catch(() => adapter.clearAppOwnedBillingAvailability());
  if (!configured || !authClient) {
    return () => {
      disposed = true;
      adapter.clearAppOwnedBillingAvailability();
    };
  }

  const { data } = authClient.auth.onAuthStateChange((_event, session) => reconcile(session));
  return () => {
    disposed = true;
    data.subscription.unsubscribe();
    adapter.clearAppOwnedBillingAvailability();
  };
}
