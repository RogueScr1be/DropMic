export const RECORDING_DURATIONS = [30, 60, 90] as const;
export type RecordingDuration = (typeof RECORDING_DURATIONS)[number];

export const RECORDING_STATES = [
  'idle',
  'requesting_permission',
  'permission_denied',
  'ready',
  'countdown',
  'recording',
  'paused',
  'completing',
  'cancelling',
  'completed',
  'interrupted',
  'error',
] as const;
export type RecordingState = (typeof RECORDING_STATES)[number];

export type RecordingContext = {
  state: RecordingState;
  selectedDurationSeconds: RecordingDuration;
  startedAtMs: number | null;
  completedAtMs: number | null;
  elapsedMs: number;
  recordingUri: string | null;
  error: string | null;
  failureKind: 'recording' | 'persistence' | 'cleanup' | null;
  cleanupPending: boolean;
  nowMs: number;
};

export type RecordingEvent =
  | { type: 'REQUEST_PERMISSION' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'SELECT_DURATION'; duration: RecordingDuration }
  | { type: 'BEGIN_COUNTDOWN' }
  | { type: 'COUNTDOWN_COMPLETE' }
  | { type: 'STOP_REQUESTED' }
  | { type: 'RESUME_REQUESTED' }
  | { type: 'COMPLETE_REQUESTED' }
  | { type: 'FINALIZED'; uri: string }
  | {
      type: 'RESTORE_COMPLETED';
      completedAtMs: number;
      elapsedMs: number;
      selectedDurationSeconds: RecordingDuration;
      uri: string;
    }
  | { type: 'PERSISTENCE_CONFIRMED'; completedAtMs?: number }
  | { type: 'PERSISTENCE_FAILED'; message: string }
  | { type: 'CANCEL_HOLD_STARTED' }
  | { type: 'CANCEL_HOLD_RELEASED' }
  | { type: 'CANCEL_CONFIRMED' }
  | { type: 'CLEANUP_SUCCEEDED' }
  | { type: 'CLEANUP_FAILED'; message: string }
  | { type: 'RECORDING_INTERRUPTED'; reason: string }
  | { type: 'FAILURE'; message: string }
  | { type: 'RETRY' }
  | { type: 'RETRY_SAVE' }
  | { type: 'RETRY_CLEANUP' }
  | { type: 'DELETE_RECORDING' }
  | { type: 'CANCEL' };

export const initialRecordingContext: RecordingContext = {
  state: 'idle',
  selectedDurationSeconds: 60,
  startedAtMs: null,
  completedAtMs: null,
  elapsedMs: 0,
  recordingUri: null,
  error: null,
  failureKind: null,
  cleanupPending: false,
  nowMs: 0,
};

export class InvalidRecordingTransition extends Error {
  constructor(state: RecordingState, event: RecordingEvent['type']) {
    super(`Invalid recording transition: ${state} -> ${event}`);
    this.name = 'InvalidRecordingTransition';
  }
}

export function transition(
  context: RecordingContext,
  event: RecordingEvent,
  nowMs: number,
): RecordingContext {
  const base = { ...context, nowMs, error: null };

  switch (`${context.state}:${event.type}`) {
    case 'idle:REQUEST_PERMISSION':
      return { ...base, state: 'requesting_permission' };
    case 'permission_denied:REQUEST_PERMISSION':
      return { ...base, state: 'requesting_permission' };
    case 'ready:REQUEST_PERMISSION':
      return { ...base, state: 'requesting_permission' };
    case 'requesting_permission:PERMISSION_GRANTED':
      return { ...base, state: 'ready' };
    case 'requesting_permission:PERMISSION_DENIED':
      return { ...base, state: 'permission_denied' };
    case 'idle:SELECT_DURATION':
    case 'permission_denied:SELECT_DURATION':
    case 'ready:SELECT_DURATION':
      return {
        ...base,
        selectedDurationSeconds: (event as Extract<RecordingEvent, { type: 'SELECT_DURATION' }>).duration,
      };
    case 'ready:BEGIN_COUNTDOWN':
      return { ...base, state: 'countdown' };
    case 'countdown:COUNTDOWN_COMPLETE':
      return { ...base, state: 'recording', startedAtMs: nowMs, elapsedMs: 0 };
    case 'countdown:CANCEL':
      return { ...base, state: 'ready' };
    case 'countdown:RECORDING_INTERRUPTED':
      return {
        ...base,
        state: 'interrupted',
        cleanupPending: true,
        error: (event as Extract<RecordingEvent, { type: 'RECORDING_INTERRUPTED' }>).reason,
      };
    case 'recording:STOP_REQUESTED':
      return {
        ...base,
        state: 'paused',
        elapsedMs: deriveActiveElapsedMs(
          context.elapsedMs,
          context.startedAtMs,
          nowMs,
          context.selectedDurationSeconds * 1000,
        ),
        startedAtMs: null,
      };
    case 'paused:RESUME_REQUESTED':
      return { ...base, state: 'recording', startedAtMs: nowMs };
    case 'recording:COMPLETE_REQUESTED':
      return {
        ...base,
        state: 'completing',
        elapsedMs: deriveActiveElapsedMs(
          context.elapsedMs,
          context.startedAtMs,
          nowMs,
          context.selectedDurationSeconds * 1000,
        ),
        startedAtMs: null,
      };
    case 'paused:COMPLETE_REQUESTED':
      return { ...base, state: 'completing', startedAtMs: null };
    case 'completing:FINALIZED':
      return {
        ...base,
        recordingUri: (event as Extract<RecordingEvent, { type: 'FINALIZED' }>).uri,
      };
    case 'completing:PERSISTENCE_CONFIRMED':
      return {
        ...base,
        state: 'completed',
        completedAtMs:
          (event as Extract<RecordingEvent, { type: 'PERSISTENCE_CONFIRMED' }>).completedAtMs ??
          nowMs,
      };
    case 'idle:RESTORE_COMPLETED':
    case 'ready:RESTORE_COMPLETED': {
      const restored = event as Extract<RecordingEvent, { type: 'RESTORE_COMPLETED' }>;
      return {
        ...base,
        state: 'completed',
        selectedDurationSeconds: restored.selectedDurationSeconds,
        startedAtMs: null,
        completedAtMs: restored.completedAtMs,
        elapsedMs: Math.min(
          restored.selectedDurationSeconds * 1000,
          Math.max(0, restored.elapsedMs),
        ),
        recordingUri: restored.uri,
        failureKind: null,
        cleanupPending: false,
      };
    }
    case 'completing:PERSISTENCE_FAILED':
      return {
        ...base,
        state: 'error',
        failureKind: 'persistence',
        error: (event as Extract<RecordingEvent, { type: 'PERSISTENCE_FAILED' }>).message,
      };
    case 'paused:CANCEL_HOLD_STARTED':
      return { ...base, state: 'cancelling' };
    case 'cancelling:CANCEL_HOLD_RELEASED':
      return { ...base, state: 'paused' };
    case 'paused:CANCEL_CONFIRMED':
    case 'cancelling:CANCEL_CONFIRMED':
      return { ...base, state: 'cancelling' };
    case 'cancelling:CLEANUP_SUCCEEDED':
      return {
        ...initialRecordingContext,
        selectedDurationSeconds: context.selectedDurationSeconds,
        nowMs,
      };
    case 'interrupted:CLEANUP_SUCCEEDED':
      return { ...base, cleanupPending: false };
    case 'cancelling:CLEANUP_FAILED':
    case 'interrupted:CLEANUP_FAILED':
      return {
        ...base,
        state: 'error',
        failureKind: 'cleanup',
        cleanupPending: false,
        error: (event as Extract<RecordingEvent, { type: 'CLEANUP_FAILED' }>).message,
      };
    case 'recording:RECORDING_INTERRUPTED':
    case 'paused:RECORDING_INTERRUPTED':
    case 'completing:RECORDING_INTERRUPTED':
    case 'cancelling:RECORDING_INTERRUPTED':
      return {
        ...base,
        state: 'interrupted',
        startedAtMs: null,
        elapsedMs: deriveActiveElapsedMs(
          context.elapsedMs,
          context.startedAtMs,
          nowMs,
          context.selectedDurationSeconds * 1000,
        ),
        cleanupPending: true,
        error: (event as Extract<RecordingEvent, { type: 'RECORDING_INTERRUPTED' }>).reason,
      };
    case 'recording:FAILURE':
    case 'paused:FAILURE':
    case 'completing:FAILURE':
    case 'cancelling:FAILURE':
    case 'countdown:FAILURE':
    case 'requesting_permission:FAILURE':
    case 'completed:FAILURE':
      return {
        ...base,
        state: 'error',
        failureKind: 'recording',
        error: (event as Extract<RecordingEvent, { type: 'FAILURE' }>).message,
      };
    case 'error:RETRY_SAVE':
      if (context.failureKind !== 'persistence' || !context.recordingUri) {
        throw new InvalidRecordingTransition(context.state, event.type);
      }
      return { ...base, state: 'completing', failureKind: null };
    case 'error:RETRY_CLEANUP':
      if (context.failureKind !== 'cleanup') {
        throw new InvalidRecordingTransition(context.state, event.type);
      }
      return { ...base, state: 'cancelling', failureKind: null };
    case 'completed:RETRY':
    case 'interrupted:RETRY':
    case 'error:RETRY':
      return {
        ...base,
        state: 'ready',
        startedAtMs: null,
        completedAtMs: null,
        elapsedMs: 0,
        recordingUri: null,
        failureKind: null,
        cleanupPending: false,
      };
    case 'completed:DELETE_RECORDING':
      return { ...initialRecordingContext, selectedDurationSeconds: context.selectedDurationSeconds, nowMs };
    default:
      throw new InvalidRecordingTransition(context.state, event.type);
  }
}

export function deriveElapsedMs(
  startedAtMs: number | null,
  nowMs: number,
  maxDurationMs: number,
): number {
  if (startedAtMs === null) {
    return 0;
  }
  return Math.min(maxDurationMs, Math.max(0, nowMs - startedAtMs));
}

export function deriveActiveElapsedMs(
  accumulatedMs: number,
  startedAtMs: number | null,
  nowMs: number,
  maxDurationMs: number,
): number {
  const currentSegmentMs = startedAtMs === null ? 0 : Math.max(0, nowMs - startedAtMs);
  return Math.min(maxDurationMs, Math.max(0, accumulatedMs + currentSegmentMs));
}

export function isRecordingState(state: RecordingState) {
  return state === 'recording';
}

export function isInterruptibleState(state: RecordingState) {
  return state === 'countdown' || state === 'recording' || state === 'paused' || state === 'completing' || state === 'cancelling';
}
