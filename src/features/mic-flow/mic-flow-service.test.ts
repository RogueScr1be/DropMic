import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

const mockRpc: any = jest.fn();

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/features/auth/auth-client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: jest.fn(), signInAnonymously: jest.fn() },
    from: jest.fn(),
  },
}));
jest.mock('@/features/auth/auth-service', () => ({ getSession: jest.fn() }));

import { supabase } from '@/features/auth/auth-client';
import { getSession } from '@/features/auth/auth-service';
import { createClient } from '@supabase/supabase-js';
import {
  establishAnonymousMicFlowSession,
  recordMicFlowCompletion,
  type MicFlowRecordingIdentity,
} from './mic-flow-service';

const mockSupabase = supabase as any;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const identity: MicFlowRecordingIdentity = { userId: 'anon-1', accessToken: 'captured-token' };
const state = {
  owner_id: 'anon-1',
  current_flow: 1,
  best_flow: 1,
  saves_available: 1,
  last_rewarded_milestone: 0,
  last_qualified_day: '2026-09-03',
  last_completed_at: '2026-09-03T12:00:00.000Z',
  timezone: 'America/Chicago',
  created_at: '2026-09-03T12:00:00.000Z',
  updated_at: '2026-09-03T12:00:00.000Z',
};
const completion = {
  completionId: 'micdrop-completion-1',
  mode: 'cold_take' as const,
  topicId: 'small-joy',
  selectedDurationSeconds: 30 as const,
  completedDurationSeconds: 30,
  timezone: 'America/Chicago',
};

describe('Mic Flow completion service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({ rpc: mockRpc } as any);
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabase.auth.signInAnonymously.mockResolvedValue({
      data: { session: { user: { id: 'anon-1' }, access_token: 'captured-token' } },
      error: null,
    });
    mockGetSession.mockResolvedValue({ user: { id: 'anon-1' }, access_token: 'current-token' } as any);
    mockRpc.mockResolvedValue({ data: { status: 'credited', state }, error: null });
  });

  it('attempts a trusted anonymous session before recording', async () => {
    await expect(establishAnonymousMicFlowSession()).resolves.toEqual(identity);
    expect(mockSupabase.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('keeps recording startup bounded when session creation hangs', async () => {
    mockSupabase.auth.getSession.mockReturnValueOnce(new Promise(() => undefined));
    await expect(establishAnonymousMicFlowSession({ timeoutMs: 1 })).resolves.toBeNull();
  });

  it('ignores a stale anonymous-session result when the caller invalidates it', async () => {
    let resolveSession!: (value: unknown) => void;
    mockSupabase.auth.getSession.mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve; }));
    let current = true;
    const pending = establishAnonymousMicFlowSession({ isCurrent: () => current });
    current = false;
    resolveSession({ data: { session: { user: { id: 'anon-1' }, access_token: 'captured-token' } }, error: null });
    await expect(pending).resolves.toBeNull();
  });

  it('does not credit an unowned completion and sends no owner identity', async () => {
    await expect(recordMicFlowCompletion(completion, null)).resolves.toEqual({ status: 'unavailable', reason: 'unowned' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('uses the captured bearer token and sends the server-owned completion contract', async () => {
    await recordMicFlowCompletion(completion, identity);
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'public-test-key',
      expect.objectContaining({
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
        global: { headers: { Authorization: 'Bearer captured-token' } },
      }),
    );
    expect(mockRpc).toHaveBeenCalledWith('record_mic_flow_completion', {
      p_completion_id: completion.completionId,
      p_mode: completion.mode,
      p_topic_id: completion.topicId,
      p_selected_duration_seconds: 30,
      p_completed_duration_seconds: 30,
      p_timezone: completion.timezone,
      p_use_save: null,
    });
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('owner_id');
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('completed_at');
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('audio_uri');
  });

  it('accepts every explicit server status and preserves a null Save decision', async () => {
    for (const status of ['credited', 'already_credited', 'same_day', 'save_decision_required'] as const) {
      mockRpc.mockResolvedValueOnce({ data: { status, state }, error: null });
      await expect(recordMicFlowCompletion(completion, identity)).resolves.toMatchObject({ status, state });
    }
  });

  it('rejects malformed server state and unknown status', async () => {
    mockRpc.mockResolvedValueOnce({ data: { status: 'credited', state: { ...state, saves_available: 4 } }, error: null });
    await expect(recordMicFlowCompletion(completion, identity)).resolves.toEqual({ status: 'unavailable', reason: 'malformed_response' });
    mockRpc.mockResolvedValueOnce({ data: { status: 'unexpected', state }, error: null });
    await expect(recordMicFlowCompletion(completion, identity)).resolves.toEqual({ status: 'unavailable', reason: 'malformed_response' });
  });

  it('rejects stale identity before or after the RPC', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'different-user' }, access_token: 'other-token' } as any);
    await expect(recordMicFlowCompletion(completion, identity)).resolves.toEqual({ status: 'unavailable', reason: 'stale_identity' });
    expect(mockRpc).not.toHaveBeenCalled();

    mockGetSession.mockResolvedValueOnce({ user: { id: 'anon-1' }, access_token: 'current-token' } as any);
    mockGetSession.mockResolvedValueOnce({ user: { id: 'different-user' }, access_token: 'other-token' } as any);
    await expect(recordMicFlowCompletion(completion, identity)).resolves.toEqual({ status: 'unavailable', reason: 'stale_identity' });
  });

  it('retries with the same completion identity and never sends client state', async () => {
    await recordMicFlowCompletion(completion, identity);
    await recordMicFlowCompletion(completion, identity);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1].p_completion_id).toBe(mockRpc.mock.calls[1][1].p_completion_id);
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain('current_flow');
  });
});
