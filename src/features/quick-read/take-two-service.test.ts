import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('@/features/auth/auth-client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from '@/features/auth/auth-client';
import { compareTakeTwo } from './take-two-service';

const mockSupabase = supabase as any;
const mockGetSession: any = mockSupabase.auth.getSession;
const mockInvoke: any = mockSupabase.functions.invoke;

const comparison = {
  baseline: {
    runId: 'run-a',
    attemptId: 'attempt-a',
    createdAt: '2026-09-01T10:00:00.000Z',
    scores: { clarity: 0.6, structure: 0.7, specificity: 0.8, concision: 0.9 },
    metrics: { wordCount: 100, wordsPerMinute: 100, fillerWordCount: 4 },
  },
  followUp: {
    runId: 'run-b',
    attemptId: 'attempt-b',
    createdAt: '2026-09-01T11:00:00.000Z',
    scores: { clarity: 0.7, structure: 0.8, specificity: 0.9, concision: 1 },
    metrics: { wordCount: 120, wordsPerMinute: 120, fillerWordCount: 2 },
  },
  deltas: {
    scores: { clarity: 0.1, structure: 0.1, specificity: 0.1, concision: 0.1 },
    metrics: { wordCount: 20, wordsPerMinute: 20, fillerWordCount: -2 },
  },
};

describe('Take Two client service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } }, error: null });
    mockInvoke.mockResolvedValue({ data: { status: 'completed', comparison }, error: null });
  });

  it('sends only baseline and follow-up run IDs and validates the comparison', async () => {
    await expect(compareTakeTwo({ baselineRunId: 'run-a', followUpRunId: 'run-b' })).resolves.toEqual(comparison);
    expect(mockInvoke).toHaveBeenCalledWith('take-two', {
      body: { firstRunId: 'run-a', secondRunId: 'run-b' },
    });
    expect(JSON.stringify(mockInvoke.mock.calls[0])).not.toContain('owner_id');
  });

  it('fails closed for session loss and anonymous users', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(compareTakeTwo({ baselineRunId: 'run-a', followUpRunId: 'run-b' })).rejects.toMatchObject({ code: 'take_two_denied' });
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { is_anonymous: true } } }, error: null });
    await expect(compareTakeTwo({ baselineRunId: 'run-a', followUpRunId: 'run-b' })).rejects.toMatchObject({ code: 'take_two_denied' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('turns 401, 403, network, and malformed responses into neutral service errors', async () => {
    for (const response of [
      { data: { error: 'authentication_required' }, error: new Error('401') },
      { data: { error: 'plus_required' }, error: new Error('403') },
      { data: null, error: new Error('network') },
      { data: { status: 'completed', comparison: { malformed: true } }, error: null },
    ]) {
      mockInvoke.mockResolvedValueOnce(response);
      await expect(compareTakeTwo({ baselineRunId: 'run-a', followUpRunId: 'run-b' })).rejects.toBeInstanceOf(Error);
    }
  });
});
