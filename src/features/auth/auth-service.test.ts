import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

const mockSession = { user: { id: 'user-1' }, access_token: 'token' };
const mockSupabase: any = {
  auth: {
    getSession: jest.fn(),
    signInAnonymously: jest.fn(),
    updateUser: jest.fn(),
    verifyOtp: jest.fn(),
    signInWithOtp: jest.fn(),
    signOut: jest.fn(),
  },
  from: jest.fn(),
  rpc: jest.fn(),
};

jest.mock('./auth-client', () => ({ isSupabaseConfigured: true, supabase: mockSupabase }));

import AsyncStorage from '@react-native-async-storage/async-storage';
// The mocked client must be loaded after the module mock is registered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const authService = require('./auth-service') as typeof import('./auth-service');
import { saveUnclaimedAttempt } from './auth-recovery';

describe('auth service', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockSupabase.auth.signInAnonymously.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockSupabase.auth.updateUser.mockResolvedValue({ data: { user: mockSession.user }, error: null });
    mockSupabase.auth.verifyOtp.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockSupabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    mockSupabase.from.mockImplementation(() => ({
      upsert: jest.fn<() => Promise<any>>().mockResolvedValue({ error: null }),
      update: jest.fn<() => { eq: () => Promise<any> }>().mockReturnValue({ eq: jest.fn<() => Promise<any>>().mockResolvedValue({ error: null }) }),
    }));
  });

  it('creates an anonymous session only when one is absent', async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await expect(authService.ensureAnonymousSession()).resolves.toEqual(mockSession);

    expect(mockSupabase.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('converts the current anonymous user and verifies an email-change OTP', async () => {
    await authService.beginEmailConversion(' Person@Example.com ');
    await authService.verifyEmailConversion('Person@Example.com', '123456');

    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ email: 'person@example.com' });
    expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'person@example.com', token: '123456', type: 'email_change' });
  });

  it('keeps the recovery path open when an OTP is invalid', async () => {
    mockSupabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Token has expired' } });

    await expect(authService.verifyEmailConversion('person@example.com', '000000')).rejects.toThrow('Token has expired');
  });

  it('claims the same client attempt idempotently and never stores audio', async () => {
    const attempt = {
      audioRetained: false as const,
      clientAttemptId: 'client-attempt-1',
      completedAt: new Date(1000).toISOString(),
      completedDurationSeconds: 30,
      selectedDurationSeconds: 30 as const,
      topicId: 'topic-1',
    };
    await saveUnclaimedAttempt(attempt);

    await expect(authService.claimUnclaimedAttempt(attempt)).resolves.toBe(true);
    await expect(authService.claimUnclaimedAttempt(attempt)).resolves.toBe(true);

    const attemptsTables: any[] = mockSupabase.from.mock.results.map((result: any) => result.value);
    const upserts = attemptsTables.flatMap((table) => table.upsert.mock.calls);
    expect(mockSupabase.from).toHaveBeenCalledWith('attempts');
    expect(upserts).toHaveLength(2);
    expect(upserts[0][0]).not.toHaveProperty('audioUri');
  });

  it('writes onboarding metadata and supports sign out and deletion', async () => {
    await authService.saveOnboarding({ ageGateConfirmed: true, blockers: ['I ramble'], freeTextGoal: '', goals: ['Be concise'] });
    await authService.beginEmailSignIn('person@example.com');
    await authService.signOut();
    await authService.deleteAccount();

    expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
    expect(mockSupabase.from).toHaveBeenCalledWith('speaking_preferences');
    expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'person@example.com', options: { shouldCreateUser: false } });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(2);
  });
});
