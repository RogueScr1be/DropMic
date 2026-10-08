import { describe, expect, it, jest } from '@jest/globals';

import {
  createRevenueCatWebhookHandler,
  fetchRevenueCatSubscriberSnapshot,
  parseRevenueCatSubscriberSnapshot,
} from '../../../supabase/functions/_shared/revenuecat-webhook';

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const appId = 'appe887860c65';
const now = new Date('2026-10-08T12:00:00.000Z');

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function webhook(type = 'RENEWAL', extra: Record<string, unknown> = {}) {
  return new Request('https://example.test/revenuecat-webhook', {
    method: 'POST',
    headers: { Authorization: 'Bearer webhook-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: {
      id: 'evt-1', type, app_id: appId, app_user_id: ownerA,
      event_timestamp_ms: Date.parse('2026-10-08T11:59:00.000Z'), ...extra,
    } }),
  });
}

function subscriber(overrides: Record<string, unknown> = {}) {
  return {
    request_date: '2026-10-08T12:00:00Z',
    subscriber: {
      entitlements: {
        plus: {
          product_identifier: 'dropmic_plus_monthly',
          purchase_date: '2026-09-08T12:00:00Z',
          expires_date: '2026-11-08T12:00:00Z',
          grace_period_expires_date: null,
          ...overrides,
        },
      },
    },
  };
}

describe('RevenueCat webhook sync', () => {
  it('rejects unauthenticated requests before fetching subscriber state', async () => {
    const getSnapshot = jest.fn(async () => { throw new Error('must not run'); });
    const handler = createRevenueCatWebhookHandler({
      authorization: 'Bearer webhook-secret', appId, getSnapshot, applySnapshot: jest.fn(async () => undefined),
    });
    const request = webhook();
    const bad = new Request(request, { headers: { Authorization: 'Bearer wrong' } });
    const result = await handler(bad);
    expect(result.status).toBe(401);
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it('synchronizes the current verified Plus snapshot instead of trusting event purchase fields', async () => {
    const snapshot = parseRevenueCatSubscriberSnapshot(ownerA, subscriber(), now);
    const getSnapshot = jest.fn(async () => snapshot);
    const applySnapshot = jest.fn(async () => undefined);
    const handler = createRevenueCatWebhookHandler({ authorization: 'Bearer webhook-secret', appId, getSnapshot, applySnapshot, now: () => now });

    const result = await handler(webhook('RENEWAL', { product_id: 'forged', entitlement_ids: ['not-plus'] }));
    expect(result.status).toBe(200);
    expect(getSnapshot).toHaveBeenCalledWith(ownerA);
    expect(applySnapshot).toHaveBeenCalledWith({
      id: 'evt-1', type: 'RENEWAL', occurredAt: '2026-10-08T11:59:00.000Z',
    }, snapshot);
  });

  it('ignores test events and events from another RevenueCat app', async () => {
    const getSnapshot = jest.fn(async () => { throw new Error('must not run'); });
    const handler = createRevenueCatWebhookHandler({
      authorization: 'Bearer webhook-secret', appId, getSnapshot, applySnapshot: jest.fn(async () => undefined),
    });
    const test = await handler(webhook('TEST'));
    const wrongApp = await handler(webhook('RENEWAL', { app_id: 'another-app' }));
    expect(test.status).toBe(200);
    expect(wrongApp.status).toBe(200);
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it('reconciles every UUID involved in a transfer and ignores non-UUID aliases', async () => {
    const getSnapshot = jest.fn(async (ownerId: string) => parseRevenueCatSubscriberSnapshot(ownerId, subscriber(), now));
    const applySnapshot = jest.fn(async () => undefined);
    const handler = createRevenueCatWebhookHandler({ authorization: 'Bearer webhook-secret', appId, getSnapshot, applySnapshot });
    const result = await handler(webhook('TRANSFER', {
      transferred_from: [ownerA, '$RCAnonymousID:abc'],
      transferred_to: [ownerB],
    }));
    expect(result.status).toBe(200);
    expect(getSnapshot.mock.calls.map(([ownerId]) => ownerId)).toEqual([ownerA, ownerB]);
    expect(applySnapshot).toHaveBeenCalledTimes(2);
  });

  it('fails closed for malformed events and provider lookup failures so RevenueCat can retry', async () => {
    const getSnapshot = jest.fn(async () => { throw new Error('provider unavailable'); });
    const handler = createRevenueCatWebhookHandler({
      authorization: 'Bearer webhook-secret', appId, getSnapshot, applySnapshot: jest.fn(async () => undefined),
    });
    const malformed = new Request('https://example.test/revenuecat-webhook', {
      method: 'POST', headers: { Authorization: 'Bearer webhook-secret' }, body: '{bad',
    });
    expect((await handler(malformed)).status).toBe(400);
    expect((await handler(webhook())).status).toBe(503);
  });

  it('maps RevenueCat lifetime, grace, and expired snapshots without client input', () => {
    const lifetime = parseRevenueCatSubscriberSnapshot(ownerA, subscriber({ expires_date: null }), now);
    expect(lifetime.hasEntitlement).toBe(true);
    if (lifetime.hasEntitlement) {
      expect(lifetime.snapshot.status).toBe('active');
      expect(lifetime.snapshot.expiresAt).toBe('9999-12-31T23:59:59.999Z');
    }

    const grace = parseRevenueCatSubscriberSnapshot(ownerA, subscriber({
      expires_date: '2026-10-07T12:00:00Z',
      grace_period_expires_date: '2026-10-09T12:00:00Z',
    }), now);
    expect(grace.hasEntitlement && grace.snapshot.status).toBe('grace');

    const expired = parseRevenueCatSubscriberSnapshot(ownerA, subscriber({ expires_date: '2026-10-07T12:00:00Z' }), now);
    expect(expired.hasEntitlement && expired.snapshot.status).toBe('expired');
  });

  it('represents a provider snapshot with no Plus entitlement as a revocation check', () => {
    const result = parseRevenueCatSubscriberSnapshot(ownerA, {
      request_date: '2026-10-08T12:00:00Z', subscriber: { entitlements: {} },
    }, now);
    expect(result).toEqual({ ownerId: ownerA, hasEntitlement: false, snapshotAt: '2026-10-08T12:00:00.000Z' });
  });

  it('uses the public API key only for the server-side current-subscriber lookup', async () => {
    const fetcher = jest.fn(async () => response(subscriber()));
    await fetchRevenueCatSubscriberSnapshot(ownerA, 'public-key', fetcher as unknown as typeof fetch, now);
    expect(fetcher).toHaveBeenCalledWith(`https://api.revenuecat.com/v1/subscribers/${ownerA}`, expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer public-key', 'X-Platform': 'ios' }),
    }));
  });
});
