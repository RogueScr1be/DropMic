import { describe, expect, it } from '@jest/globals';

import { resolvePlusAccess } from '../../../supabase/functions/_shared/entitlement';

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

describe('R0F-B server-authoritative Plus resolver', () => {
  it('denies a missing row', () => {
    expect(resolvePlusAccess(null, now)).toEqual({ allowed: false, reason: 'missing' });
  });

  it('allows active access before expiration', () => {
    expect(resolvePlusAccess(entitlement(), now)).toEqual({ allowed: true, reason: 'allowed' });
  });

  it('denies active access at and after expiration', () => {
    const expiresAt = '2026-09-01T12:00:00.000Z';
    expect(resolvePlusAccess(entitlement({ expires_at: expiresAt }), now)).toEqual({
      allowed: false,
      reason: 'expired',
    });
    expect(resolvePlusAccess(entitlement({ expires_at: '2026-09-01T11:59:59.999Z' }), now)).toEqual({
      allowed: false,
      reason: 'expired',
    });
  });

  it('allows grace access before grace expiration', () => {
    expect(resolvePlusAccess(entitlement({
      status: 'grace',
      grace_expires_at: '2026-09-01T12:00:00.001Z',
    }), now)).toEqual({ allowed: true, reason: 'allowed' });
  });

  it('denies grace access at and after grace expiration', () => {
    expect(resolvePlusAccess(entitlement({
      status: 'grace',
      grace_expires_at: '2026-09-01T12:00:00.000Z',
    }), now)).toEqual({ allowed: false, reason: 'grace_expired' });
    expect(resolvePlusAccess(entitlement({
      status: 'grace',
      grace_expires_at: '2026-09-01T11:59:59.999Z',
    }), now)).toEqual({ allowed: false, reason: 'grace_expired' });
  });

  it('denies expired state', () => {
    expect(resolvePlusAccess(entitlement({ status: 'expired' }), now)).toEqual({
      allowed: false,
      reason: 'expired',
    });
  });

  it('denies revoked state', () => {
    expect(resolvePlusAccess(entitlement({ status: 'revoked' }), now)).toEqual({
      allowed: false,
      reason: 'revoked',
    });
  });

  it('fails closed for malformed status, timestamps, and required state', () => {
    expect(resolvePlusAccess(entitlement({ status: 'unknown' }), now)).toEqual({
      allowed: false,
      reason: 'malformed',
    });
    expect(resolvePlusAccess(entitlement({ expires_at: 'not-a-time' }), now)).toEqual({
      allowed: false,
      reason: 'malformed',
    });
    expect(resolvePlusAccess(entitlement({ grace_expires_at: 'not-a-time' }), now)).toEqual({
      allowed: false,
      reason: 'malformed',
    });
    expect(resolvePlusAccess(entitlement({ status: 'grace', grace_expires_at: null }), now)).toEqual({
      allowed: false,
      reason: 'malformed',
    });
  });

  it('fails closed for an invalid evaluation time', () => {
    expect(resolvePlusAccess(entitlement(), new Date('invalid'))).toEqual({
      allowed: false,
      reason: 'malformed',
    });
  });
});
