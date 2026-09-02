import { resolvePlusAccess } from '../../../supabase/functions/_shared/entitlement';
import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';

const ENTITLEMENT_FIELDS = 'entitlement_key,provider,product_id,status,started_at,expires_at,grace_expires_at,last_event_id,last_event_at,created_at,updated_at';

/**
 * Reads only the authenticated user's RLS-scoped entitlement for display.
 * The Take Two Edge Function remains the final authorization boundary.
 */
export async function getPlusDisplayEligibility(now = new Date()): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  try {
    const sessionResult = await supabase.auth.getSession();
    if (sessionResult.error || !sessionResult.data.session?.user || sessionResult.data.session.user.is_anonymous) {
      return false;
    }

    const entitlementResult = await supabase
      .from('billing_entitlements')
      .select(ENTITLEMENT_FIELDS)
      .eq('entitlement_key', 'plus')
      .maybeSingle();
    if (entitlementResult.error) {
      return false;
    }

    return resolvePlusAccess(entitlementResult.data, now).allowed;
  } catch {
    return false;
  }
}

export function subscribeToPlusDisplaySession(onChange: (userId: string | null) => void) {
  if (!isSupabaseConfigured || !supabase) {
    return () => undefined;
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user?.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}
