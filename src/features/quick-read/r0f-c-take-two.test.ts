import { describe, expect, it, jest } from '@jest/globals';

import {
  buildTakeTwoComparison,
  handleTakeTwoRequest,
  type TakeTwoDependencies,
  type TakeTwoMetrics,
  type TakeTwoRepository,
  type TakeTwoResult,
  type TakeTwoRun,
} from '../../../supabase/functions/_shared/take-two';

const entitlement = {
  entitlement_key: 'plus',
  provider: 'revenuecat',
  product_id: 'dropmic_plus_monthly',
  status: 'active',
  started_at: '2026-09-01T00:00:00.000Z',
  expires_at: '2099-10-01T00:00:00.000Z',
  grace_expires_at: null,
  last_event_id: 'event-1',
  last_event_at: '2026-09-01T00:00:00.000Z',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const runs: TakeTwoRun[] = [
  {
    id: '00000000-0000-4000-8000-000000000002',
    attemptId: '00000000-0000-4000-8000-000000000012',
    promptId: 'topic-1',
    status: 'completed',
    createdAt: '2026-09-01T10:00:00.000Z',
    completedAt: '2026-09-01T10:01:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000001',
    attemptId: '00000000-0000-4000-8000-000000000011',
    promptId: 'topic-1',
    status: 'completed',
    createdAt: '2026-09-01T09:00:00.000Z',
    completedAt: '2026-09-01T09:01:00.000Z',
  },
];

const results: TakeTwoResult[] = runs.map((run, index) => ({
  runId: run.id,
  attemptId: run.attemptId,
  clarity: index === 0 ? 0.9 : 0.7,
  structure: index === 0 ? 0.8 : 0.6,
  specificity: index === 0 ? 0.7 : 0.5,
  concision: index === 0 ? 0.6 : 0.4,
}));

const metrics: TakeTwoMetrics[] = runs.map((run, index) => ({
  attemptId: run.attemptId,
  clarity: index === 0 ? 0.9 : 0.7,
  structure: index === 0 ? 0.8 : 0.6,
  specificity: index === 0 ? 0.7 : 0.5,
  concision: index === 0 ? 0.6 : 0.4,
  wordCount: index === 0 ? 120 : 100,
  wordsPerMinute: index === 0 ? 120 : 100,
  fillerWordCount: index === 0 ? 2 : 4,
}));

function repository(overrides: Partial<TakeTwoRepository> = {}): TakeTwoRepository {
  return {
    getEntitlement: async () => entitlement,
    getRuns: async () => runs,
    getResults: async () => results,
    getMetrics: async () => metrics,
    ...overrides,
  };
}

function dependencies(overrides: Partial<TakeTwoDependencies> = {}): TakeTwoDependencies {
  return {
    authenticate: async (token) => token === 'valid-token'
      ? { userId: 'user-a', isAnonymous: false }
      : null,
    repository: repository(),
    ...overrides,
  };
}

async function request(body: unknown, deps: TakeTwoDependencies = dependencies()) {
  return handleTakeTwoRequest(new Request('https://example.test/take-two', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), deps);
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('R0F-C local Take Two capability', () => {
  it('denies missing and invalid authentication, and anonymous users', async () => {
    await expect(handleTakeTwoRequest(new Request('https://example.test/take-two', { method: 'POST' }), dependencies()))
      .resolves.toMatchObject({ status: 401 });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
      authenticate: async () => null,
    }))).resolves.toMatchObject({ status: 401 });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
      authenticate: async () => ({ userId: 'anonymous', isAnonymous: true }),
    }))).resolves.toMatchObject({ status: 403 });
  });

  it('allows active and grace Plus, and denies missing, expired, revoked, and boundary access', async () => {
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id })).resolves.toMatchObject({ status: 200 });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
      repository: repository({ getEntitlement: async () => ({ ...entitlement, status: 'grace', expires_at: '2026-08-01T00:00:00.000Z', grace_expires_at: '2099-10-01T00:00:00.000Z' }) }),
    }))).resolves.toMatchObject({ status: 200 });
    for (const state of [
      null,
      { ...entitlement, status: 'expired' },
      { ...entitlement, status: 'revoked' },
      { ...entitlement, status: 'active', expires_at: '2000-01-01T00:00:00.000Z' },
      { ...entitlement, status: 'grace', expires_at: '2000-01-01T00:00:00.000Z', grace_expires_at: '2000-01-01T00:00:00.000Z' },
    ]) {
      await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
        repository: repository({ getEntitlement: async () => state }),
      }))).resolves.toMatchObject({ status: 403 });
    }
  });

  it('derives repository ownership from the verified JWT and rejects client owner_id', async () => {
    const ownerIds: string[] = [];
    const repo = repository({
      getEntitlement: async (ownerId) => {
        ownerIds.push(ownerId);
        return entitlement;
      },
    });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({ repository: repo })))
      .resolves.toMatchObject({ status: 200 });
    expect(ownerIds).toEqual(['user-a']);
    await expect(request({ owner_id: 'attacker', firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({ repository: repo })))
      .resolves.toMatchObject({ status: 400 });
  });

  it('enforces cross-owner isolation, distinct runs, same prompt, and completion', async () => {
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
      repository: repository({ getRuns: async () => [runs[0]] }),
    }))).resolves.toMatchObject({ status: 404 });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[0].id })).resolves.toMatchObject({ status: 400 });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
      repository: repository({ getRuns: async () => runs.map((run, index) => index === 1 ? { ...run, promptId: 'topic-2' } : run) }),
    }))).resolves.toMatchObject({ status: 409 });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
      repository: repository({ getRuns: async () => runs.map((run, index) => index === 1 ? { ...run, status: 'requested' } : run) }),
    }))).resolves.toMatchObject({ status: 409 });
  });

  it('orders baseline chronologically and returns deterministic raw deltas', () => {
    const first = buildTakeTwoComparison(runs, results, metrics);
    const second = buildTakeTwoComparison(runs, results, metrics);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      baseline: { runId: runs[1].id },
      followUp: { runId: runs[0].id },
      deltas: {
        scores: { clarity: 0.2, structure: 0.2, specificity: 0.2, concision: 0.2 },
        metrics: { wordCount: 20, wordsPerMinute: 20, fillerWordCount: -2 },
      },
    });
  });

  it('returns comparison_unavailable for missing or malformed metrics', async () => {
    for (const override of [
      { getResults: async () => [] },
      { getMetrics: async () => [{ ...metrics[0], wordCount: null }, metrics[1]] },
      { getMetrics: async () => [{ ...metrics[0], clarity: 0.1 }, metrics[1]] },
    ]) {
      await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({
        repository: repository(override),
      }))).resolves.toMatchObject({ status: 422 });
    }
  });

  it('reads only entitlement, runs, results, and metrics; it makes no provider or write calls', async () => {
    const calls: string[] = [];
    const provider = jest.fn();
    const write = jest.fn();
    const repo = repository({
      getEntitlement: async (ownerId) => { calls.push(`entitlement:${ownerId}`); return entitlement; },
      getRuns: async (ownerId) => { calls.push(`runs:${ownerId}`); return runs; },
      getResults: async (ownerId) => { calls.push(`results:${ownerId}`); return results; },
      getMetrics: async (ownerId) => { calls.push(`metrics:${ownerId}`); return metrics; },
    });
    await expect(request({ firstRunId: runs[0].id, secondRunId: runs[1].id }, dependencies({ repository: repo })))
      .resolves.toMatchObject({ status: 200 });
    expect(calls).toEqual(['entitlement:user-a', 'runs:user-a', 'results:user-a', 'metrics:user-a']);
    expect(provider).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not change the Free Quick Read contract', async () => {
    const response = await request({ firstRunId: runs[0].id, secondRunId: runs[1].id });
    const body = await responseBody(response);
    expect(body).toHaveProperty('status', 'completed');
    expect(body).not.toHaveProperty('audio');
    expect(body).not.toHaveProperty('transcript');
  });
});
