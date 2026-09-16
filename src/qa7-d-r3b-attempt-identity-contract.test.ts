import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const appSource = readFileSync('src/app/index.tsx', 'utf8');

function sliceBetween(startText: string, endText: string) {
  const start = appSource.indexOf(startText);
  const end = appSource.indexOf(endText, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return appSource.slice(start, end);
}

describe('QA7-D-R3B consumed TakeIdentity contracts', () => {
  it('uses one canonical ref with pending and consumed lifecycle state', () => {
    expect(appSource).toContain('const takeIdentityLifecycleRef = useRef<TakeIdentityLifecycle>');
    expect(appSource).toContain('createPendingTakeIdentity(nextTakeIdentity)');
    expect(appSource).toContain('createConsumedTakeIdentity(restoredIdentity)');
    expect(appSource).toContain('takeIdentityLifecycleRef.current.identity.clientAttemptId');
  });

  it('rotates only a consumed identity at the recording-start boundary', () => {
    const start = sliceBetween('const beginRecording = useCallback', 'const keepSavedTake');
    expect(start).toContain('const preparedIdentity = prepareIdentityForRecording(takeIdentityLifecycleRef.current);');
    expect(start).toContain('if (preparedIdentity.rotated) {');
    expect(start).toContain('beginNewTake(takeTwoBaselineRunId, preparedIdentity.lifecycle.identity);');
    expect(start).toContain('takeIdentityLifecycleRef.current = consumeTakeIdentity(takeIdentityLifecycleRef.current);');
    expect(start.indexOf('prepareIdentityForRecording')).toBeLessThan(start.indexOf('prepareAnonymousMicFlowSession'));
    expect(start.indexOf('consumeTakeIdentity')).toBeLessThan(start.indexOf("dispatch({ type: 'BEGIN_COUNTDOWN' })"));
  });

  it('preserves existing preallocation boundaries without a second rotation', () => {
    expect(appSource).toContain('beginNewTake(takeTwoBaselineRunId);');
    expect(appSource).toContain('beginNewTake(baselineRunId, nextTake.identity);');
    expect(appSource).toContain('beginNewTake();');
    expect(appSource).toContain('beginNewTake(takeTwoBaselineRunId);\n      dispatch({ type: \'RETRY\' });');
  });

  it('does not rotate on topic changes, persistence retry, or Quick Read retry', () => {
    const topic = sliceBetween('const chooseNewTopic = useCallback', 'const beginTakeTwo');
    const persistence = sliceBetween('const retrySaveFinalizedAttempt = useCallback', 'const retryCleanupRecording');
    const quickRead = readFileSync('src/features/quick-read/QuickReadFlow.tsx', 'utf8');

    expect(topic).not.toContain('prepareIdentityForRecording');
    expect(topic).not.toContain('beginNewTake');
    expect(persistence).not.toContain('beginNewTake');
    expect(quickRead).toContain('idempotencyKey');
  });

  it('marks recovered identities consumed and keeps old recovery metadata out of fresh-start rotation', () => {
    const restore = sliceBetween('const showRetainedCompletedTake = useCallback', 'const clearCountdown');
    const start = sliceBetween('const beginRecording = useCallback', 'const keepSavedTake');

    expect(restore).toContain('createConsumedTakeIdentity(restoredIdentity)');
    expect(start).not.toContain('clearLocalCompletedTake()');
    expect(start).not.toContain('clearUnclaimedAttempt()');
  });
});
