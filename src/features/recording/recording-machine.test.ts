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

  it('fails closed on invalid transitions', () => {
    expect(() => transition(initialRecordingContext, { type: 'STOP_REQUESTED' }, 100)).toThrow(
      InvalidRecordingTransition,
    );
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
