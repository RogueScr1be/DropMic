import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('@/features/auth/auth-client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    rpc: jest.fn(),
    storage: {
      from: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from '@/features/auth/auth-client';
import { startQuickRead } from './quick-read-service';

const mockedSupabase = supabase as any;

describe('Quick Read service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects anonymous sessions before creating an analysis run', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
      error: null,
    });

    await expect(startQuickRead({
      attemptId: 'attempt-1',
      audioUri: 'blob:local',
      audioExtension: 'wav',
      idempotencyKey: 'key-1',
    })).rejects.toMatchObject({ code: 'permanent_account_required' });
    expect(mockedSupabase.rpc).not.toHaveBeenCalled();
  });

  it('returns the validated structured result after upload and analysis', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: false } } },
      error: null,
    });
    mockedSupabase.rpc.mockResolvedValue({
      data: { id: 'run-1', audio_object_path: 'quick-read/user/attempt/source.wav', status: 'requested' },
      error: null,
    });
    const upload = jest.fn() as any;
    upload.mockResolvedValue({ data: { path: 'source.wav' }, error: null });
    mockedSupabase.storage.from.mockReturnValue({ upload });
    mockedSupabase.functions.invoke.mockResolvedValue({
      data: {
        status: 'completed',
        result: {
          clarity: 0.8,
          structure: 0.7,
          specificity: 0.6,
          concision: 0.9,
          strength: 'Clear opening.',
          improvement: 'Add one example.',
          nextDrill: 'Answer with one example and a closing sentence.',
        },
      },
      error: null,
    });

    await expect(startQuickRead({
      attemptId: 'attempt-1',
      audioUri: 'blob:local',
      audioExtension: 'wav',
      idempotencyKey: 'key-1',
    })).resolves.toMatchObject({ runId: 'run-1', result: { clarity: 0.8 } });
  });

  it('does not upload again when the idempotent run is already completed', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: false } } },
      error: null,
    });
    mockedSupabase.rpc.mockResolvedValue({
      data: { id: 'run-1', audio_object_path: 'quick-read/user/attempt/source.wav', status: 'completed' },
      error: null,
    });
    mockedSupabase.functions.invoke.mockResolvedValue({
      data: {
        status: 'completed',
        result: {
          clarity: 0.8,
          structure: 0.7,
          specificity: 0.6,
          concision: 0.9,
          strength: 'Clear opening.',
          improvement: 'Add one example.',
          nextDrill: 'Answer with one example and a closing sentence.',
        },
      },
      error: null,
    });

    await startQuickRead({
      attemptId: 'attempt-1',
      audioUri: 'blob:local',
      audioExtension: 'wav',
      idempotencyKey: 'key-1',
    });
    expect(mockedSupabase.storage.from).not.toHaveBeenCalled();
  });
});
