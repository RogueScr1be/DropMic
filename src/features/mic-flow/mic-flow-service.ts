import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSession } from '@/features/auth/auth-service';
import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';

export const MIC_FLOW_MODES = [
  'cold_take',
  'freestyle',
  'interview_basics',
  'student_basics',
  'challenge_response',
] as const;
export type MicFlowMode = (typeof MIC_FLOW_MODES)[number];

export type MicFlowState = {
  owner_id: string;
  current_flow: number;
  best_flow: number;
  saves_available: number;
  last_rewarded_milestone: number;
  last_qualified_day: string | null;
  last_completed_at: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

export type MicFlowRecordingIdentity = Readonly<{
  userId: string;
  accessToken: string;
}>;

export type MicFlowCompletion = {
  completionId: string;
  mode: MicFlowMode;
  topicId: string;
  selectedDurationSeconds: 30 | 60 | 90;
  completedDurationSeconds: number;
  timezone: string;
  useSave?: boolean | null;
};

type MicFlowKnownStatus = 'credited' | 'already_credited' | 'same_day' | 'save_decision_required';

export type MicFlowCompletionResult =
  | { status: MicFlowKnownStatus; state: MicFlowState }
  | {
      status: 'unavailable';
      reason: 'not_configured' | 'unowned' | 'stale_identity' | 'request_failed' | 'malformed_response';
    };

const SESSION_TIMEOUT_MS = 750;

function sessionIdentity(session: Awaited<ReturnType<typeof getSession>>): MicFlowRecordingIdentity | null {
  const userId = session?.user?.id;
  const accessToken = session?.access_token;
  if (typeof userId !== 'string' || userId.length === 0 || typeof accessToken !== 'string' || accessToken.length === 0) {
    return null;
  }
  return { userId, accessToken };
}

async function bounded<T>(promise: Promise<T>, timeoutMs = SESSION_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function establishAnonymousMicFlowSession(options?: {
  timeoutMs?: number;
  isCurrent?: () => boolean;
}): Promise<MicFlowRecordingIdentity | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }
  const client = supabase;

  const current = await bounded(Promise.resolve().then(() => client.auth.getSession()), options?.timeoutMs);
  if (!current || current.error) {
    return null;
  }
  if (current.data.session) {
    const identity = sessionIdentity(current.data.session);
    return !options?.isCurrent || options.isCurrent() ? identity : null;
  }

  const anonymous = await bounded(Promise.resolve().then(() => client.auth.signInAnonymously()), options?.timeoutMs);
  if (!anonymous || anonymous.error) {
    return null;
  }
  const identity = sessionIdentity(anonymous.data.session);
  return !options?.isCurrent || options.isCurrent() ? identity : null;
}

function identityMatches(
  session: Awaited<ReturnType<typeof getSession>>,
  identity: MicFlowRecordingIdentity,
): boolean {
  return session?.user?.id === identity.userId;
}

function createTokenClient(identity: MicFlowRecordingIdentity): SupabaseClient | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${identity.accessToken}` } },
  });
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isMicFlowState(value: unknown, ownerId: string): value is MicFlowState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    state.owner_id === ownerId &&
    Number.isInteger(state.current_flow) &&
    Number.isInteger(state.best_flow) &&
    Number.isInteger(state.saves_available) &&
    Number.isInteger(state.last_rewarded_milestone) &&
    (state.current_flow as number) >= 0 &&
    (state.best_flow as number) >= (state.current_flow as number) &&
    (state.saves_available as number) >= 0 &&
    (state.saves_available as number) <= 3 &&
    (state.last_rewarded_milestone as number) >= 0 &&
    (state.last_qualified_day === null || typeof state.last_qualified_day === 'string') &&
    (state.last_completed_at === null || isIsoTimestamp(state.last_completed_at)) &&
    (state.timezone === null || typeof state.timezone === 'string') &&
    isIsoTimestamp(state.created_at) &&
    isIsoTimestamp(state.updated_at)
  );
}

function parseCompletionResponse(data: unknown, ownerId: string): MicFlowCompletionResult {
  if (!data || typeof data !== 'object') {
    return { status: 'unavailable', reason: 'malformed_response' };
  }
  const response = data as Record<string, unknown>;
  if (response.status === 'unavailable') {
    return { status: 'unavailable', reason: 'request_failed' };
  }
  if (
    response.status !== 'credited' &&
    response.status !== 'already_credited' &&
    response.status !== 'same_day' &&
    response.status !== 'save_decision_required'
  ) {
    return { status: 'unavailable', reason: 'malformed_response' };
  }
  if (!isMicFlowState(response.state, ownerId)) {
    return { status: 'unavailable', reason: 'malformed_response' };
  }
  return { status: response.status as MicFlowKnownStatus, state: response.state };
}

export async function recordMicFlowCompletion(
  input: MicFlowCompletion,
  identity: MicFlowRecordingIdentity | null,
): Promise<MicFlowCompletionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'unavailable', reason: 'not_configured' };
  }
  if (!identity) {
    return { status: 'unavailable', reason: 'unowned' };
  }

  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch {
    return { status: 'unavailable', reason: 'stale_identity' };
  }
  if (!identityMatches(session, identity)) {
    return { status: 'unavailable', reason: 'stale_identity' };
  }

  const tokenClient = createTokenClient(identity);
  if (!tokenClient) {
    return { status: 'unavailable', reason: 'not_configured' };
  }

  let result: { data: unknown; error: { message?: string } | null };
  try {
    result = await tokenClient.rpc('record_mic_flow_completion', {
      p_completion_id: input.completionId,
      p_mode: input.mode,
      p_topic_id: input.topicId,
      p_selected_duration_seconds: input.selectedDurationSeconds,
      p_completed_duration_seconds: input.completedDurationSeconds,
      p_timezone: input.timezone,
      p_use_save: input.useSave ?? null,
    });
  } catch {
    return { status: 'unavailable', reason: 'request_failed' };
  }
  if (result.error) {
    return { status: 'unavailable', reason: 'request_failed' };
  }

  let afterSession: Awaited<ReturnType<typeof getSession>>;
  try {
    afterSession = await getSession();
  } catch {
    return { status: 'unavailable', reason: 'stale_identity' };
  }
  if (!identityMatches(afterSession, identity)) {
    return { status: 'unavailable', reason: 'stale_identity' };
  }
  return parseCompletionResponse(result.data, identity.userId);
}

export async function getMicFlowState(): Promise<MicFlowState | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    const session = await getSession();
    const identity = sessionIdentity(session);
    if (!identity) {
      return null;
    }
    const result = await supabase
      .from('mic_flow_state')
      .select('owner_id,current_flow,best_flow,saves_available,last_rewarded_milestone,last_qualified_day,last_completed_at,timezone,created_at,updated_at')
      .maybeSingle();
    return result.error || !result.data || !isMicFlowState(result.data, identity.userId) ? null : result.data;
  } catch {
    return null;
  }
}
