import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('@/features/auth/auth-client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from '@/features/auth/auth-client';
import { getPlusDisplayEligibility } from './plus-display';

const mockSupabase = supabase as any;
const mockGetSession: any = mockSupabase.auth.getSession;
const mockFrom: any = mockSupabase.from;

const now = new Date('2026-09-01T12:00:00.000Z');

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    entitlement_key: 'plus',
    provider: 'revenuecat',
    product_id: 'dropmic_plus_monthly',
    status: 'active',
    started_at: '2026-09-01T11:00:00.000Z',
    expires_at: '2026-10-01T12:00:00.000Z',
    grace_expires_at: null,
    last_event_id: 'event-1',
    last_event_at: '2026-09-01T11:00:00.000Z',
    created_at: '2026-09-01T11:00:00.000Z',
    updated_at: '2026-09-01T11:00:00.000Z',
    ...overrides,
  };
}

function configure(row: unknown, error: { message: string } | null = null) {
  const query: any = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: row, error });
  mockFrom.mockReturnValue(query);
}

describe('Plus display eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } }, error: null });
    configure(entitlement());
  });

  it('shows only active-unexpired and valid grace access', async () => {
    await expect(getPlusDisplayEligibility(now)).resolves.toBe(true);
    configure(entitlement({ status: 'grace', expires_at: '2026-08-01T00:00:00.000Z', grace_expires_at: '2026-09-02T00:00:00.000Z' }));
    await expect(getPlusDisplayEligibility(now)).resolves.toBe(true);
  });

  it('hides at expiration boundaries and for expired, revoked, missing, or malformed state', async () => {
    for (const row of [
      entitlement({ expires_at: now.toISOString() }),
      entitlement({ status: 'expired' }),
      entitlement({ status: 'revoked' }),
      null,
      entitlement({ status: 'unknown' }),
      entitlement({ grace_expires_at: 'not-a-time' }),
    ]) {
      configure(row);
      await expect(getPlusDisplayEligibility(now)).resolves.toBe(false);
    }
  });

  it('hides for anonymous users, session failures, and entitlement query failures', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { is_anonymous: true } } }, error: null });
    await expect(getPlusDisplayEligibility(now)).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();

    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'session lost' } });
    await expect(getPlusDisplayEligibility(now)).resolves.toBe(false);

    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { is_anonymous: false } } }, error: null });
    configure(null, { message: 'network failure' });
    await expect(getPlusDisplayEligibility(now)).resolves.toBe(false);
  });

  it('queries the authenticated RLS scope without sending owner_id', async () => {
    await getPlusDisplayEligibility(now);
    const query = mockFrom.mock.results[0].value;
    expect(mockFrom).toHaveBeenCalledWith('billing_entitlements');
    expect(query.eq).toHaveBeenCalledWith('entitlement_key', 'plus');
    expect(query.eq).not.toHaveBeenCalledWith('owner_id', expect.anything());
  });
});
