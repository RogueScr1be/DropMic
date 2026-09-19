import {
  clearPendingAuth,
  clearUnclaimedAttempt,
  getPendingAuth,
  getUnclaimedAttempt,
  savePendingAuth,
  type UnclaimedAttempt,
} from './auth-recovery';
import type { AuthCallbackPayload } from './auth-callback';
import { isSupabaseConfigured, supabase } from './auth-client';

export type OnboardingInput = {
  ageGateConfirmed: boolean;
  goals: string[];
  blockers: string[];
  freeTextGoal: string;
};

export class AuthServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AuthServiceError('Account setup is not configured yet. Your recording remains on this device.');
  }
  return supabase;
}

function throwIfError(error: { message?: string } | null) {
  if (error) {
    throw new AuthServiceError(error.message ?? 'Account setup failed.');
  }
}

export async function getSession() {
  const client = requireClient();
  const result = await client.auth.getSession();
  throwIfError(result.error);
  return result.data.session;
}

export async function completeAuthCallback(payload?: AuthCallbackPayload | null) {
  const client = requireClient();
  const currentSession = await getSession();

  if (!payload) {
    if (!currentSession) {
      throw new AuthServiceError('This verification link is invalid or expired.');
    }
    await assertConversionContinuity(currentSession);
    await clearPendingAuth();
    return currentSession;
  }

  if (currentSession?.access_token === payload.accessToken) {
    await assertConversionContinuity(currentSession);
    await clearPendingAuth();
    return currentSession;
  }

  const result = await client.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  throwIfError(result.error);
  if (!result.data.session) {
    throw new AuthServiceError('This verification link is invalid or expired.');
  }
  await assertConversionContinuity(result.data.session);
  await clearPendingAuth();
  return result.data.session;
}

export async function ensureAnonymousSession() {
  const client = requireClient();
  const current = await client.auth.getSession();
  throwIfError(current.error);
  if (current.data.session) {
    return current.data.session;
  }

  const result = await client.auth.signInAnonymously();
  throwIfError(result.error);
  if (!result.data.session) {
    throw new AuthServiceError('Anonymous session was not created.');
  }
  return result.data.session;
}

export async function beginEmailConversion(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    throw new AuthServiceError('Enter a valid email address.');
  }
  const client = requireClient();
  const anonymousSession = await ensureAnonymousSession();
  const result = await client.auth.updateUser({ email: normalizedEmail });
  throwIfError(result.error);
  await savePendingAuth({
    intent: 'anonymous-conversion',
    email: normalizedEmail,
    anonymousUserId: anonymousSession.user.id,
    createdAt: Date.now(),
  });
}

export async function verifyEmailConversion(email: string, token: string) {
  const client = requireClient();
  const result = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email_change' });
  throwIfError(result.error);
  if (!result.data.session) {
    throw new AuthServiceError('The code was accepted but no session was returned.');
  }
  await assertConversionContinuity(result.data.session);
  await clearPendingAuth();
  return result.data.session;
}

export async function beginEmailSignIn(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    throw new AuthServiceError('Enter a valid email address.');
  }
  const client = requireClient();
  const result = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: false },
  });
  throwIfError(result.error);
  await savePendingAuth({
    intent: 'existing-sign-in',
    email: normalizedEmail,
    createdAt: Date.now(),
  });
}

export async function verifyEmailSignIn(email: string, token: string) {
  const client = requireClient();
  const result = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
  throwIfError(result.error);
  if (!result.data.session) {
    throw new AuthServiceError('The code was accepted but no session was returned.');
  }
  await clearPendingAuth();
  return result.data.session;
}

export function isDevTestLoginEnabled() {
  const devTestLoginEnabled =
    __DEV__ &&
    process.env.EXPO_PUBLIC_DROPMIC_DEV_TEST_LOGIN === '1';
  return devTestLoginEnabled;
}

export async function signInWithDevTestAccount(email: string, password: string) {
  if (!isDevTestLoginEnabled()) {
    throw new AuthServiceError('Development test login is unavailable.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@') || password.length === 0) {
    throw new AuthServiceError('Enter the development test account credentials.');
  }
  const client = requireClient();
  const result = await client.auth.signInWithPassword({ email: normalizedEmail, password });
  if (result.error) {
    throw new AuthServiceError('Development test login failed. Check the credentials.');
  }
  if (!result.data.session || result.data.session.user.is_anonymous !== false) {
    throw new AuthServiceError('The development test account must be a permanent account.');
  }
  await clearPendingAuth();
  return result.data.session;
}

export async function saveOnboarding(input: OnboardingInput) {
  if (!input.ageGateConfirmed || input.goals.length === 0 || input.blockers.length === 0) {
    throw new AuthServiceError('Choose your age confirmation, at least one goal, and one blocker.');
  }
  const client = requireClient();
  const session = await getSession();
  if (!session?.user) {
    throw new AuthServiceError('Your session expired. Start account setup again.');
  }
  const now = new Date().toISOString();
  const profile = await client.from('profiles').upsert({
    user_id: session.user.id,
    age_gate_confirmed_at: now,
    updated_at: now,
  });
  throwIfError(profile.error);
  const preferences = await client.from('speaking_preferences').upsert({
    user_id: session.user.id,
    goals: input.goals,
    blockers: input.blockers,
    free_text_goal: input.freeTextGoal.trim() || null,
    updated_at: now,
  });
  throwIfError(preferences.error);
  const completed = await client.from('profiles').update({ onboarding_completed_at: now, updated_at: now }).eq('user_id', session.user.id);
  throwIfError(completed.error);
}

export async function claimUnclaimedAttempt(attempt?: UnclaimedAttempt | null) {
  const client = requireClient();
  const session = await getSession();
  if (!session?.user) {
    throw new AuthServiceError('Your session expired. Your local take is still recoverable.');
  }
  const localAttempt = attempt ?? (await getUnclaimedAttempt());
  if (!localAttempt) {
    return false;
  }
  const result = await client
    .from('attempts')
    .upsert(
      {
        owner_id: session.user.id,
        client_attempt_id: localAttempt.clientAttemptId,
        topic_id: localAttempt.topicId,
        selected_duration_seconds: localAttempt.selectedDurationSeconds,
        completed_duration_seconds: localAttempt.completedDurationSeconds,
        completed_at: localAttempt.completedAt,
        audio_retained: false,
      },
      { onConflict: 'client_attempt_id' },
    )
    .select('id')
    .single();
  throwIfError(result.error);
  if (!result.data?.id) {
    throw new AuthServiceError('The attempt was saved without a server identity. Try again.');
  }
  await clearUnclaimedAttempt();
  return result.data.id;
}

export async function signOut() {
  const client = requireClient();
  const result = await client.auth.signOut({ scope: 'local' });
  throwIfError(result.error);
  await clearPendingAuth();
}

export async function deleteAccount() {
  const client = requireClient();
  const result = await client.rpc('delete_my_account');
  throwIfError(result.error);
  await clearUnclaimedAttempt();
  await clearPendingAuth();
  await client.auth.signOut({ scope: 'local' });
}

async function assertConversionContinuity(session: { user?: { id?: string } } | null) {
  const pendingAuth = await getPendingAuth();
  if (pendingAuth?.intent !== 'anonymous-conversion' || !pendingAuth.anonymousUserId) {
    return;
  }
  if (session?.user?.id === pendingAuth.anonymousUserId) {
    return;
  }
  throw new AuthServiceError(
    'That email belongs to an existing account. Use the returning-user sign-in path before recording a new Drop; this saved take stays on this device.',
  );
}
