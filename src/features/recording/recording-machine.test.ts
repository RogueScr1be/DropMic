import {
  deriveElapsedMs,
  initialRecordingContext,
  InvalidRecordingTransition,
  transition,
} from './recording-machine';
import { describe, expect, it } from '@jest/globals';

describe('recording state machine', () => {
  it('walks the permission, countdown, recording, processing, and completed path', () => {
    let context = transition(initialRecordingContext, { type: 'REQUEST_PERMISSION' }, 100);
    context = transition(context, { type: 'PERMISSION_GRANTED' }, 200);
    context = transition(context, { type: 'BEGIN_COUNTDOWN' }, 300);
    context = transition(context, { type: 'COUNTDOWN_COMPLETE' }, 400);
    context = transition(context, { type: 'STOP_REQUESTED' }, 30_400);
    context = transition(context, { type: 'RECORDING_READY', uri: 'file:///local.m4a' }, 30_500);

    expect(context.state).toBe('completed');
    expect(context.recordingUri).toBe('file:///local.m4a');
    expect(context.elapsedMs).toBe(30_000);
  });

  it('allows the first-use flow to choose a duration before permission is requested', () => {
    let context = transition(initialRecordingContext, { type: 'SELECT_DURATION', duration: 30 }, 100);
    expect(context.selectedDurationSeconds).toBe(30);

    context = transition(context, { type: 'REQUEST_PERMISSION' }, 200);
    context = transition(context, { type: 'PERMISSION_DENIED' }, 300);
    context = transition(context, { type: 'SELECT_DURATION', duration: 90 }, 400);
    expect(context.selectedDurationSeconds).toBe(90);

    context = transition(context, { type: 'REQUEST_PERMISSION' }, 500);
    expect(context.state).toBe('requesting_permission');
  });

  it('fails closed on invalid transitions', () => {
    expect(() => transition(initialRecordingContext, { type: 'STOP_REQUESTED' }, 100)).toThrow(
      InvalidRecordingTransition,
    );
  });

  it('protects repeated start, early stop, and delete during processing', () => {
    let context = transition(initialRecordingContext, { type: 'REQUEST_PERMISSION' }, 100);
    context = transition(context, { type: 'PERMISSION_GRANTED' }, 200);
    context = transition(context, { type: 'BEGIN_COUNTDOWN' }, 300);

    expect(() => transition(context, { type: 'BEGIN_COUNTDOWN' }, 301)).toThrow(
      InvalidRecordingTransition,
    );
    expect(() => transition(context, { type: 'STOP_REQUESTED' }, 302)).toThrow(
      InvalidRecordingTransition,
    );

    context = transition(context, { type: 'COUNTDOWN_COMPLETE' }, 400);
    context = transition(context, { type: 'STOP_REQUESTED' }, 500);
    expect(() => transition(context, { type: 'DELETE_RECORDING' }, 501)).toThrow(
      InvalidRecordingTransition,
    );
  });

  it('turns an interruption during countdown into a retryable interruption', () => {
    let context = transition(initialRecordingContext, { type: 'REQUEST_PERMISSION' }, 100);
    context = transition(context, { type: 'PERMISSION_GRANTED' }, 200);
    context = transition(context, { type: 'BEGIN_COUNTDOWN' }, 300);
    context = transition(
      context,
      { type: 'RECORDING_INTERRUPTED', reason: 'backgrounded' },
      400,
    );

    expect(context.state).toBe('interrupted');
    expect(context.recordingUri).toBeNull();
  });

  it('fails closed on stale completion after retry and preserves playback failures', () => {
    let context = transition(initialRecordingContext, { type: 'REQUEST_PERMISSION' }, 100);
    context = transition(context, { type: 'PERMISSION_GRANTED' }, 200);
    context = transition(context, { type: 'BEGIN_COUNTDOWN' }, 300);
    context = transition(context, { type: 'COUNTDOWN_COMPLETE' }, 400);
    context = transition(context, { type: 'STOP_REQUESTED' }, 500);
    context = transition(context, { type: 'RECORDING_READY', uri: 'file:///local.m4a' }, 600);
    context = transition(context, { type: 'RETRY' }, 700);

    expect(() => transition(context, { type: 'RECORDING_READY', uri: 'file:///stale.m4a' }, 701)).toThrow(
      InvalidRecordingTransition,
    );

    context = transition(
      transition(context, { type: 'BEGIN_COUNTDOWN' }, 800),
      { type: 'COUNTDOWN_COMPLETE' },
      900,
    );
    context = transition(context, { type: 'STOP_REQUESTED' }, 1_000);
    context = transition(context, { type: 'RECORDING_READY', uri: 'file:///local.m4a' }, 1_100);
    context = transition(context, { type: 'FAILURE', message: 'playback failed' }, 1_200);
    expect(context.state).toBe('error');
    expect(context.recordingUri).toBe('file:///local.m4a');
  });

  it('handles permission denial, interruption, retry, and deletion', () => {
    let context = transition(initialRecordingContext, { type: 'REQUEST_PERMISSION' }, 100);
    context = transition(context, { type: 'PERMISSION_DENIED' }, 200);
    expect(context.state).toBe('permission_denied');

    context = transition(context, { type: 'REQUEST_PERMISSION' }, 300);
    context = transition(context, { type: 'PERMISSION_GRANTED' }, 400);
    context = transition(context, { type: 'BEGIN_COUNTDOWN' }, 500);
    context = transition(context, { type: 'COUNTDOWN_COMPLETE' }, 600);
    context = transition(
      context,
      { type: 'RECORDING_INTERRUPTED', reason: 'backgrounded' },
      700,
    );
    expect(context.state).toBe('interrupted');
    context = transition(context, { type: 'RETRY' }, 800);
    expect(context.state).toBe('ready');

    context = transition(context, { type: 'BEGIN_COUNTDOWN' }, 900);
    context = transition(context, { type: 'COUNTDOWN_COMPLETE' }, 1_000);
    context = transition(context, { type: 'STOP_REQUESTED' }, 31_000);
    context = transition(context, { type: 'RECORDING_READY', uri: 'file:///local.m4a' }, 31_100);
    context = transition(context, { type: 'DELETE_RECORDING' }, 31_200);
    expect(context.state).toBe('idle');
    expect(context.recordingUri).toBeNull();
  });
});

describe('timer derivation', () => {
  it.each([30, 60, 90])('clamps %ss at the selected duration', (duration: number) => {
    expect(deriveElapsedMs(1_000, 1_000 + duration * 1_000 + 500, duration * 1_000)).toBe(
      duration * 1_000,
    );
  });

  it('never returns negative time or time without a start timestamp', () => {
    expect(deriveElapsedMs(2_000, 1_000, 90_000)).toBe(0);
    expect(deriveElapsedMs(null, 5_000, 90_000)).toBe(0);
  });
});
