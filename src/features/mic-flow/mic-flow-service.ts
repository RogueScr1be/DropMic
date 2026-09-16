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

export const MIC_FLOW_SNAPSHOT_STATUSES = [
  'not_started',
  'protected_today',
  'needs_rep_today',
  'recoverable_with_save',
  'reset_pending',
] as const;
export type MicFlowSnapshotStatus = (typeof MIC_FLOW_SNAPSHOT_STATUSES)[number];

export type MicFlowSnapshot = {
  status: MicFlowSnapshotStatus;
  current_flow: number;
  best_flow: number;
  saves_available: number;
  last_qualified_day: string | null;
  timezone: string | null;
};

export type MicFlowSnapshotCoordinator = {
  transition(ownerId: string | null): void;
  invalidate(): void;
  refresh(ownerId: string, options?: { force?: boolean }): Promise<MicFlowSnapshot | null>;
};

export type MicFlowRecordingIdentity = Readonly<{
  userId: string;
  accessToken: string;
}>;

export const MIC_FLOW_OWNER_FAILURE_REASONS = [
  'timeout',
  'network',
  'auth',
  'invalid_session',
  'unknown',
] as const;
export type MicFlowOwnerFailureReason = (typeof MIC_FLOW_OWNER_FAILURE_REASONS)[number];

export type MicFlowOwnerPreparationResult =
  | { status: 'ready'; identity: MicFlowRecordingIdentity }
  | { status: 'unavailable'; reason: MicFlowOwnerFailureReason };

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

const SESSION_TIMEOUT_MS = 5000;

let ownerPreparationInFlight: Promise<MicFlowOwnerPreparationResult> | null = null;

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

type TimedOwnerPreparationResult =
  | { status: 'resolved'; value: MicFlowOwnerPreparationResult }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' };

async function waitForOwnerPreparation(
  operation: Promise<MicFlowOwnerPreparationResult>,
  timeoutMs = SESSION_TIMEOUT_MS,
): Promise<TimedOwnerPreparationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(
        (value) => ({ status: 'resolved' as const, value }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      ),
      new Promise<{ status: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function classifyOwnerFailure(error: unknown): MicFlowOwnerFailureReason {
  if (!error || typeof error !== 'object') {
    return 'unknown';
  }
  const detail = error as { code?: unknown; message?: unknown; status?: unknown; name?: unknown };
  const code = typeof detail.code === 'string' ? detail.code.toLowerCase() : '';
  const message = typeof detail.message === 'string' ? detail.message.toLowerCase() : '';
  const name = typeof detail.name === 'string' ? detail.name.toLowerCase() : '';
  const status = typeof detail.status === 'number' ? detail.status : null;

  if ((status !== null && status >= 500) || /network|fetch|offline|connection|timeout|timed out/.test(`${code} ${message} ${name}`)) {
    return 'network';
  }
  if (status === 401 || status === 403 || /auth|jwt|token|credential|sign.?in|session/.test(`${code} ${message} ${name}`)) {
    return 'auth';
  }
  return 'unknown';
}

function reportOwnerFailure(reason: MicFlowOwnerFailureReason): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[MicFlow] local recording owner unavailable: ${reason}`);
  }
}

async function runOwnerPreparation(client: NonNullable<typeof supabase>): Promise<MicFlowOwnerPreparationResult> {
  try {
    const current = await client.auth.getSession();
    if (current.error) {
      return { status: 'unavailable', reason: classifyOwnerFailure(current.error) };
    }
    if (current.data.session) {
      const identity = sessionIdentity(current.data.session);
      return identity ? { status: 'ready', identity } : { status: 'unavailable', reason: 'invalid_session' };
    }

    const anonymous = await client.auth.signInAnonymously();
    if (anonymous.error) {
      return { status: 'unavailable', reason: classifyOwnerFailure(anonymous.error) };
    }
    const identity = sessionIdentity(anonymous.data.session);
    return identity ? { status: 'ready', identity } : { status: 'unavailable', reason: 'invalid_session' };
  } catch (error) {
    return { status: 'unavailable', reason: classifyOwnerFailure(error) };
  }
}

function getOwnerPreparationOperation(client: NonNullable<typeof supabase>): Promise<MicFlowOwnerPreparationResult> {
  if (ownerPreparationInFlight) {
    return ownerPreparationInFlight;
  }

  const operation = runOwnerPreparation(client);
  ownerPreparationInFlight = operation;
  void operation.then(
    () => {
      if (ownerPreparationInFlight === operation) {
        ownerPreparationInFlight = null;
      }
    },
    () => {
      if (ownerPreparationInFlight === operation) {
        ownerPreparationInFlight = null;
      }
    },
  );
  return operation;
}

export function createMicFlowSnapshotCoordinator(
  load: (ownerId: string) => Promise<MicFlowSnapshot | null> = async () => getMicFlowSnapshot(),
): MicFlowSnapshotCoordinator {
  let generation = 0;
  let desiredOwnerId: string | null = null;
  let inFlight: Promise<MicFlowSnapshot | null> | null = null;

  const transition = (ownerId: string | null) => {
    generation += 1;
    desiredOwnerId = ownerId;
    inFlight = null;
  };

  const invalidate = () => transition(null);

  const refresh = (ownerId: string, options?: { force?: boolean }) => {
    if (desiredOwnerId !== ownerId) {
      transition(ownerId);
    } else if (options?.force) {
      generation += 1;
      inFlight = null;
    }

    if (inFlight && !options?.force) {
      return inFlight;
    }

    const requestGeneration = generation;
    const requestOwnerId = desiredOwnerId;
    let request: Promise<MicFlowSnapshot | null>;
    let loaded: Promise<MicFlowSnapshot | null>;
    try {
      loaded = Promise.resolve(load(requestOwnerId as string));
    } catch {
      loaded = Promise.reject(new Error('snapshot_load_failed'));
    }
    request = loaded
      .then((snapshot) => (
        requestGeneration === generation && requestOwnerId === desiredOwnerId ? snapshot : null
      ))
      .catch(() => null)
      .finally(() => {
        if (inFlight === request) {
          inFlight = null;
        }
      });
    inFlight = request;
    return request;
  };

  return { invalidate, refresh, transition };
}

export async function prepareAnonymousMicFlowSession(options?: {
  timeoutMs?: number;
  isCurrent?: () => boolean;
}): Promise<MicFlowOwnerPreparationResult | null> {
  if (!isSupabaseConfigured || !supabase) {
    const result = { status: 'unavailable' as const, reason: 'auth' as const };
    reportOwnerFailure(result.reason);
    return result;
  }
  const timed = await waitForOwnerPreparation(getOwnerPreparationOperation(supabase), options?.timeoutMs);
  if (timed.status === 'timeout') {
    reportOwnerFailure('timeout');
    return { status: 'unavailable', reason: 'timeout' };
  }
  if (timed.status === 'rejected') {
    reportOwnerFailure(classifyOwnerFailure(timed.error));
    return { status: 'unavailable', reason: classifyOwnerFailure(timed.error) };
  }
  if (options?.isCurrent && !options.isCurrent()) {
    return null;
  }
  if (timed.value.status === 'unavailable') {
    reportOwnerFailure(timed.value.reason);
  }
  return timed.value;
}

export async function establishAnonymousMicFlowSession(options?: {
  timeoutMs?: number;
  isCurrent?: () => boolean;
}): Promise<MicFlowRecordingIdentity | null> {
  const result = await prepareAnonymousMicFlowSession(options);
  return result?.status === 'ready' ? result.identity : null;
}

export async function getMicFlowOwnerId(options?: { timeoutMs?: number }): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }
  const session = await bounded(Promise.resolve().then(() => getSession()), options?.timeoutMs);
  return typeof session?.user?.id === 'string' && session.user.id.length > 0 ? session.user.id : null;
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

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function isMicFlowSnapshot(value: unknown): value is MicFlowSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as Record<string, unknown>;
  if (
    !MIC_FLOW_SNAPSHOT_STATUSES.includes(snapshot.status as MicFlowSnapshotStatus) ||
    !Number.isInteger(snapshot.current_flow) ||
    !Number.isInteger(snapshot.best_flow) ||
    !Number.isInteger(snapshot.saves_available) ||
    (snapshot.current_flow as number) < 0 ||
    (snapshot.best_flow as number) < (snapshot.current_flow as number) ||
    (snapshot.saves_available as number) < 0 ||
    (snapshot.saves_available as number) > 3
  ) {
    return false;
  }

  if (snapshot.status === 'not_started') {
    return snapshot.current_flow === 0 &&
      snapshot.last_qualified_day === null &&
      snapshot.timezone === null;
  }

  return isDate(snapshot.last_qualified_day) &&
    typeof snapshot.timezone === 'string' &&
    snapshot.timezone.length > 0;
}

export async function getMicFlowSnapshot(options?: { timeoutMs?: number }): Promise<MicFlowSnapshot | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }
  const client = supabase;

  const timeoutMs = options?.timeoutMs ?? SESSION_TIMEOUT_MS;
  try {
    const session = await bounded(Promise.resolve().then(() => getSession()), timeoutMs);
    if (!session?.user?.id || !session.access_token) {
      return null;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const result = await bounded(
      Promise.resolve().then(() => client.rpc('get_mic_flow_snapshot', { p_timezone: timezone })),
      timeoutMs,
    );
    return !result || result.error || !isMicFlowSnapshot(result.data) ? null : result.data;
  } catch {
    return null;
  }
}
