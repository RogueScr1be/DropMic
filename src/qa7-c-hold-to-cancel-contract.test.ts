import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const appSource = readFileSync('src/app/index.tsx', 'utf8');
const holdSource = readFileSync('src/features/recording/HoldToCancel.tsx', 'utf8');

describe('QA7-C direct hold contracts', () => {
  it('keeps cancellation on one visible hold control with no confirmation action', () => {
    expect(holdSource).toContain('testID="hold-to-cancel"');
    expect(holdSource).not.toContain('Confirm Cancel');
    expect(holdSource).not.toContain('confirm-cancel-recording');
    expect(holdSource).not.toContain('cancel-recording-confirmation');
    expect(holdSource).toContain(`HOLD_TO_CANCEL_MS = 1_500`);
    expect(holdSource).toContain('onResponderTerminate={releaseHold}');
  });

  it('starts the existing state-machine hold and confirmed cleanup path from the paused view', () => {
    expect(appSource).toContain('onCancel={() => void cancelActiveRecording()}');
    expect(appSource).toContain('onHoldRelease={() => dispatch({ type: \'CANCEL_HOLD_RELEASED\' })}');
    expect(appSource).toContain('onHoldStart={() => dispatch({ type: \'CANCEL_HOLD_STARTED\' })}');

    const cancelStart = appSource.indexOf('const cancelActiveRecording = useCallback');
    const cancelEnd = appSource.indexOf('const deleteRetainedCompletedTake', cancelStart);
    const cancelSource = appSource.slice(cancelStart, cancelEnd);
    expect(cancelSource.indexOf("dispatch({ type: 'CANCEL_CONFIRMED' })")).toBeLessThan(
      cancelSource.indexOf('await audio.discardTransientRecording()'),
    );
    expect(cancelSource).toContain('dispatch({ type: \'CLEANUP_SUCCEEDED\' })');
    expect(cancelSource).toContain('beginNewTake(takeTwoBaselineRunId)');
    expect(cancelSource).toContain("setPhase('duration_selection')");
    expect(cancelSource).not.toContain('recordMicFlowCompletion');
    expect(cancelSource).not.toContain('QuickRead');
    expect(cancelSource).not.toContain('storage');
    expect(cancelSource).not.toContain('RevenueCat');
  });

  it('keeps completion and saved-take flows outside the cancellation control', () => {
    expect(holdSource).not.toContain('onConfirm');
    expect(holdSource).not.toContain('onDelete');
    expect(appSource).toContain('audio.retainFinalizedRecording(uri)');
    expect(appSource).toContain('setCompletedTakeHidden(false)');
  });
});
