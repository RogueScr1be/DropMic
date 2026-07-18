export const RECORDING_DURATIONS = [30, 60, 90] as const;
export type RecordingDuration = (typeof RECORDING_DURATIONS)[number];

export const RECORDING_STATES = [
  'idle',
  'requesting_permission',
  'permission_denied',
  'ready',
  'countdown',
  'recording',
  'processing',
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
  | { type: 'RECORDING_READY'; uri: string }
  | { type: 'RECORDING_INTERRUPTED'; reason: string }
  | { type: 'FAILURE'; message: string }
  | { type: 'RETRY' }
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
    case 'requesting_permission:PERMISSION_GRANTED':
      return { ...base, state: 'ready' };
    case 'requesting_permission:PERMISSION_DENIED':
      return { ...base, state: 'permission_denied' };
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
    case 'recording:STOP_REQUESTED':
      return {
        ...base,
        state: 'processing',
        elapsedMs: deriveElapsedMs(
          context.startedAtMs,
          nowMs,
          context.selectedDurationSeconds * 1000,
        ),
      };
    case 'processing:RECORDING_READY':
      return {
        ...base,
        state: 'completed',
        completedAtMs: nowMs,
        recordingUri: (event as Extract<RecordingEvent, { type: 'RECORDING_READY' }>).uri,
      };
    case 'recording:RECORDING_INTERRUPTED':
      return {
        ...base,
        state: 'interrupted',
        error: (event as Extract<RecordingEvent, { type: 'RECORDING_INTERRUPTED' }>).reason,
      };
    case 'processing:FAILURE':
    case 'recording:FAILURE':
    case 'countdown:FAILURE':
    case 'requesting_permission:FAILURE':
      return {
        ...base,
        state: 'error',
        error: (event as Extract<RecordingEvent, { type: 'FAILURE' }>).message,
      };
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

export function isRecordingState(state: RecordingState) {
  return state === 'recording';
}
