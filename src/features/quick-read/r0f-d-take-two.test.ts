import React from 'react';
import { Animated, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createTakeTwoTake } from './take-two-journey';
import { RUBRIC_CRITERION_IDS } from '../../../supabase/functions/_shared/dropmic-rubric';
import type { QuickReadResult } from '../../../supabase/functions/_shared/quick-read-contract';

/* eslint-disable import/first */

jest.mock('./quick-read-service', () => ({
  startQuickRead: jest.fn(),
}));
jest.mock('./take-two-service', () => ({
  compareTakeTwo: jest.fn(),
}));
jest.mock('@/features/billing/plus-display', () => ({
  getPlusDisplayEligibility: jest.fn(),
  subscribeToPlusDisplaySession: jest.fn(() => jest.fn()),
}));

import { QuickReadFlow } from './QuickReadFlow';
import { getPlusDisplayEligibility, subscribeToPlusDisplaySession } from '@/features/billing/plus-display';
import { startQuickRead } from './quick-read-service';
import { compareTakeTwo } from './take-two-service';

const mockedStart = startQuickRead as jest.MockedFunction<typeof startQuickRead>;
const mockedEligibility = getPlusDisplayEligibility as jest.MockedFunction<typeof getPlusDisplayEligibility>;
const mockedCompare = compareTakeTwo as jest.MockedFunction<typeof compareTakeTwo>;
const mockedSubscribe = subscribeToPlusDisplaySession as jest.MockedFunction<typeof subscribeToPlusDisplaySession>;

const result = {
  clarity: 0.8,
  structure: 0.7,
  specificity: 0.6,
  concision: 0.9,
  strength: 'Clear opening.',
  improvement: 'Add one example.',
  nextDrill: 'Answer with one example and a closing sentence.',
};

const rubricResult: QuickReadResult = {
  ...result,
  clarity: 1,
  structure: 1,
  specificity: 0.875,
  concision: 1,
  rubricVersion: 'dropmic-message-v1',
  taskProfileVersion: 'dropmic-task-profile-v1',
  evaluatorPromptVersion: 'dropmic-quick-read-prompt-v1',
  rubricScores: Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, id === 'support' ? 1 : 2])) as NonNullable<QuickReadResult['rubricScores']>,
  rubricEvidence: Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, {
    excerpt: 'School should start later because tired students cannot focus.',
    rationale: 'You connect the recommendation to a reason the listener can follow.',
    reasonCode: id === 'support' ? 'support_incomplete' : 'none',
  }])) as NonNullable<QuickReadResult['rubricEvidence']>,
};

const comparison = {
  baseline: {
    runId: 'run-a', attemptId: 'attempt-a', createdAt: '2026-09-01T10:00:00.000Z',
    scores: { clarity: 0.6, structure: 0.7, specificity: 0.8, concision: 0.9 },
    metrics: { wordCount: 100, wordsPerMinute: 100, fillerWordCount: 4 },
  },
  followUp: {
    runId: 'run-b', attemptId: 'attempt-b', createdAt: '2026-09-01T11:00:00.000Z',
    scores: { clarity: 0.8, structure: 0.8, specificity: 0.9, concision: 1 },
    metrics: { wordCount: 120, wordsPerMinute: 120, fillerWordCount: 2 },
  },
  deltas: {
    scores: { clarity: 0.2, structure: 0.1, specificity: 0.1, concision: 0.1 },
    metrics: { wordCount: 20, wordsPerMinute: 20, fillerWordCount: -2 },
  },
};

function props(overrides: Partial<React.ComponentProps<typeof QuickReadFlow>> = {}): React.ComponentProps<typeof QuickReadFlow> {
  return {
    attemptId: 'server-a',
    audioExtension: 'wav',
    audioUri: 'blob:a',
    idempotencyKey: 'key-a',
    onClose: jest.fn(),
    onTakeTwo: jest.fn(),
    prompt: 'What is a small joy you make time for?',
    reducedMotion: true,
    takeId: 'take-a',
    visible: true,
    ...overrides,
  };
}

function renderFlow(overrides: Partial<React.ComponentProps<typeof QuickReadFlow>> = {}): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(React.createElement(QuickReadFlow, props(overrides)));
  });
  return renderer;
}

async function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({ accessibilityLabel: label }).props.onPress();
    await Promise.resolve();
  });
}

describe('R0F-D local Take Two journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSubscribe.mockReturnValue(jest.fn());
    mockedStart.mockResolvedValue({ runId: 'run-b', result });
    mockedEligibility.mockResolvedValue(true);
    mockedCompare.mockResolvedValue(comparison);
  });

  it('auto-starts completion entry once while Saved Drop entry keeps consent', async () => {
    let resolveRun!: (value: Awaited<ReturnType<typeof startQuickRead>>) => void;
    mockedStart.mockReturnValueOnce(new Promise((resolve) => {
      resolveRun = resolve;
    }));
    const completion = renderFlow({ autoStart: true });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedStart).toHaveBeenCalledTimes(1);
    expect(completion.root.findByProps({ accessibilityLabel: 'Analyzing Drop' })).toBeTruthy();

    await act(async () => {
      completion.update(React.createElement(QuickReadFlow, props({ autoStart: true })));
    });
    expect(mockedStart).toHaveBeenCalledTimes(1);
    resolveRun({ runId: 'run-b', result });
    await act(async () => {
      await Promise.resolve();
    });

    const savedDrop = renderFlow();
    expect(savedDrop.root.findByProps({ accessibilityLabel: 'Upload & get my Quick Read' })).toBeTruthy();
    expect(mockedStart).toHaveBeenCalledTimes(1);
  });

  it('shows a Plus-gated Take Two invitation for Free and anonymous users', async () => {
    mockedEligibility.mockResolvedValue(false);
    const free = renderFlow();
    await press(free, 'Upload & get my Quick Read');
    expect(free.root.findAllByProps({ accessibilityLabel: 'Take Two' })).toHaveLength(0);
    expect(free.root.findByProps({ testID: 'take-two-locked' })).toBeTruthy();

    mockedEligibility.mockResolvedValue(false);
    const anonymous = renderFlow({ takeId: 'take-b' });
    await press(anonymous, 'Upload & get my Quick Read');
    expect(anonymous.root.findAllByProps({ accessibilityLabel: 'Take Two' })).toHaveLength(0);
    expect(anonymous.root.findByProps({ testID: 'take-two-locked' })).toBeTruthy();
  });

  it('shows the completed Plus result invitation with accessible copy', async () => {
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findByProps({ testID: 'take-two-cta' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Take Two' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Take Two invitation' })).toBeTruthy();
  });

  it('renders the first Quick Read result before the entitlement lookup resolves', async () => {
    let resolveEligibility!: (eligible: boolean) => void;
    mockedEligibility.mockReturnValueOnce(new Promise((resolve) => { resolveEligibility = resolve; }));
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Quick Read scores' })).toBeTruthy();
    resolveEligibility(false);
    await act(async () => { await Promise.resolve(); });
  });

  it('shows the same four dimension scores to Free and Plus users', async () => {
    mockedEligibility.mockResolvedValue(false);
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');

    expect(renderer.root.findByProps({ accessibilityLabel: 'Drop Score: 75 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Clarity: 80 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Structure: 70 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Specificity: 60 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Concision: 90 percent' })).toBeTruthy();
    const visibleUnits = renderer.root.findAllByProps({ children: '%' });
    expect(visibleUnits.length).toBeGreaterThan(0);
    expect(visibleUnits.every((unit) => !('marginTop' in (unit.props.style ?? {})))).toBe(true);
    expect(renderer.root.findAll((node) => typeof node.props.children === 'string' && node.props.children.includes('SPEAKER VIBE'))).toHaveLength(0);
  });

  it('withholds only the overall score when task alignment is zero', async () => {
    mockedStart.mockResolvedValueOnce({ runId: 'run-off-task', result: { ...result, taskMet: false } });
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Drop Score: unavailable because the task was not met' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Clarity: 80 percent' })).toBeTruthy();
    expect(renderer.root.findAll((node) => node.props.children === 'Task not met. Your dimension feedback is shown without an overall score.').length).toBeGreaterThan(0);
  });

  it('animates visible score counters and bars when Reduced Motion is off', async () => {
    mockedEligibility.mockResolvedValue(false);
    const animation = { start: jest.fn(), stop: jest.fn() } as unknown as ReturnType<typeof Animated.timing>;
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
    const renderer = renderFlow({ reducedMotion: false });

    await press(renderer, 'Upload & get my Quick Read');

    expect(timing).toHaveBeenCalledTimes(5);
    expect(timing.mock.calls.map((call) => call[1].toValue)).toEqual([75, 80, 70, 60, 90]);
    expect(timing).toHaveBeenCalledWith(expect.any(Animated.Value), { duration: 720, toValue: 75, useNativeDriver: false });
    act(() => renderer.unmount());
    expect(animation.stop).toHaveBeenCalledTimes(5);
    timing.mockRestore();
  });

  it('reveals the paid-only tiles through the existing entitlement boundary', async () => {
    mockedEligibility.mockResolvedValue(true);
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => { await Promise.resolve(); });

    expect(renderer.root.findByProps({ accessibilityLabel: 'Structure: 70 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Concision: 90 percent' })).toBeTruthy();
  });

  it('shows Plus-only evidence detail while keeping the same base scores and coaching loop', async () => {
    mockedEligibility.mockResolvedValue(true);
    mockedStart.mockResolvedValueOnce({ runId: 'run-plus', result: rubricResult });
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => { await Promise.resolve(); });

    expect(renderer.root.findByProps({ accessibilityLabel: 'Drop Score: 97 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Clarity: 100 percent' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Plus score details with transcript evidence' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'rubric-evidence-support' })).toBeTruthy();
    const labels = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(labels).toContain('WHERE YOU SHINE');
    expect(labels).toContain('WHERE YOU NEED WORK');
    expect(labels).toContain('DROP DRILL');
  });

  it('does not expose rubric excerpts to Free users', async () => {
    mockedEligibility.mockResolvedValue(false);
    mockedStart.mockResolvedValueOnce({ runId: 'run-free', result: rubricResult });
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => { await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ testID: 'plus-rubric-evidence' })).toHaveLength(0);
  });

  it('preserves the original Take Two baseline when the second Quick Read fails', async () => {
    const onClose = jest.fn();
    mockedStart.mockRejectedValueOnce(Object.assign(
      new Error('Quick Read could not validate the feedback. Your recording was kept for retry.'),
      { retryAvailable: true, code: 'invalid_model_schema' },
    ));
    const renderer = renderFlow({ onClose, takeTwoBaselineRunId: 'run-first' });
    await press(renderer, 'Upload & get my Quick Read');

    expect(renderer.root.findByProps({ accessibilityLabel: 'Second Quick Read paused safely.' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry second Quick Read' })).toBeTruthy();
    await press(renderer, 'Keep both Drops');
    expect(onClose).toHaveBeenCalledWith({ preserveTakeTwoBaseline: true });
  });

  it('uses the one explicit retry to finish the second read before comparing', async () => {
    mockedStart.mockRejectedValueOnce(Object.assign(new Error('Quick Read could not validate the feedback.'), {
      code: 'invalid_model_schema',
      retryAvailable: true,
    }));
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-first' });
    await press(renderer, 'Upload & get my Quick Read');
    await press(renderer, 'Retry second Quick Read');

    expect(mockedStart).toHaveBeenCalledTimes(2);
    expect(mockedStart.mock.calls[1]?.[0]).toMatchObject({ retryFailed: true, idempotencyKey: 'key-a' });
    expect(mockedCompare).toHaveBeenCalledWith({ baselineRunId: 'run-first', followUpRunId: 'run-b' });
    expect(renderer.root.findByProps({ testID: 'take-two-comparison' })).toBeTruthy();
  });

  it('checks the same run after a lost retry response without creating another provider attempt', async () => {
    mockedStart
      .mockRejectedValueOnce(Object.assign(new Error('Schema failed.'), { code: 'invalid_model_schema', retryAvailable: true }))
      .mockRejectedValueOnce(Object.assign(new Error('Response unknown.'), { code: 'retry_status_unknown', retryStatusUnknown: true }))
      .mockResolvedValueOnce({ runId: 'run-b', result });
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-first' });

    await press(renderer, 'Upload & get my Quick Read');
    await press(renderer, 'Retry second Quick Read');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Check Quick Read status' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry second Quick Read' })).toHaveLength(0);
    await press(renderer, 'Check Quick Read status');

    expect(mockedStart).toHaveBeenCalledTimes(3);
    expect(mockedStart.mock.calls[1]?.[0]).toMatchObject({ retryFailed: true, idempotencyKey: 'key-a' });
    expect(mockedStart.mock.calls[2]?.[0]).toMatchObject({ retryFailed: true, idempotencyKey: 'key-a' });
    expect(mockedCompare).toHaveBeenCalledWith({ baselineRunId: 'run-first', followUpRunId: 'run-b' });
  });

  it('coalesces duplicate retry taps into one same-run request', async () => {
    mockedStart
      .mockRejectedValueOnce(Object.assign(new Error('Schema failed.'), { code: 'invalid_model_schema', retryAvailable: true }))
      .mockResolvedValueOnce({ runId: 'run-b', result });
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-first' });
    await press(renderer, 'Upload & get my Quick Read');

    await act(async () => {
      const retry = renderer.root.findByProps({ accessibilityLabel: 'Retry second Quick Read' });
      retry.props.onPress();
      retry.props.onPress();
      await Promise.resolve();
    });

    expect(mockedStart).toHaveBeenCalledTimes(2);
    expect(mockedStart.mock.calls[1]?.[0]).toMatchObject({ retryFailed: true, idempotencyKey: 'key-a' });
  });

  it('does not offer another retry after the server reports the single retry is unavailable', async () => {
    mockedStart.mockRejectedValueOnce(Object.assign(new Error('Retry is unavailable.'), { code: 'retry_not_available' }));
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-first' });
    await press(renderer, 'Upload & get my Quick Read');

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry second Quick Read' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Keep both Drops' })).toBeTruthy();
  });

  it('does not offer retry unless the server explicitly marks the same run eligible', async () => {
    mockedStart.mockRejectedValueOnce(Object.assign(new Error('Quick Read failed.'), { code: 'invalid_model_schema' }));
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-first' });
    await press(renderer, 'Upload & get my Quick Read');

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry second Quick Read' })).toHaveLength(0);
    expect(renderer.root.findByProps({ children: 'Contact support' })).toBeTruthy();
  });

  it('shows no style card for a legacy Quick Read result', async () => {
    const legacyResult = { ...result };
    mockedStart.mockResolvedValueOnce({ runId: 'run-legacy', result: legacyResult });
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');

    expect(renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('Vibe'))).toHaveLength(0);
  });

  it('fires Take Two once on duplicate taps and preserves the baseline run ID', async () => {
    const onTakeTwo = jest.fn();
    const renderer = renderFlow({ onTakeTwo });
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => {
      const button = renderer.root.findByProps({ accessibilityLabel: 'Take Two' });
      button.props.onPress();
      button.props.onPress();
      await Promise.resolve();
    });
    expect(onTakeTwo).toHaveBeenCalledTimes(1);
    expect(onTakeTwo).toHaveBeenCalledWith('run-b');
  });

  it('creates a fresh take and preserves the exact topic and duration', () => {
    const first = createTakeTwoTake({
      baselineRunId: 'run-a',
      topicId: 'small-joy',
      duration: 60,
      createId: jest.fn()
        .mockReturnValueOnce('take-b')
        .mockReturnValueOnce('key-b') as unknown as () => string,
    });
    expect(first).toMatchObject({ baselineRunId: 'run-a', topicId: 'small-joy', duration: 60 });
    expect(first.identity).toEqual({ clientAttemptId: 'take-b', quickReadIdempotencyKey: 'key-b' });
  });

  it('renders a successful comparison with raw deltas and no interpretation', async () => {
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-a' });
    await press(renderer, 'Upload & get my Quick Read');
    expect(mockedCompare).toHaveBeenCalledWith({ baselineRunId: 'run-a', followUpRunId: 'run-b' });
    expect(renderer.root.findByProps({ testID: 'take-two-comparison' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Clarity: 0.2' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ children: 'better' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ children: 'worse' })).toHaveLength(0);
  });

  it('preserves the Quick Read when comparison is unavailable or malformed', async () => {
    mockedCompare.mockRejectedValue(new Error('This comparison is not available yet.'));
    const renderer = renderFlow({ takeTwoBaselineRunId: 'run-a' });
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Quick Read scores' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Take Two comparison unavailable' })).toBeTruthy();
  });

  it('clears Plus display state and closes on a changed auth user', async () => {
    let sessionChanged!: (userId: string | null) => void;
    mockedSubscribe.mockImplementation((callback) => {
      sessionChanged = callback;
      return jest.fn();
    });
    const onClose = jest.fn();
    const renderer = renderFlow({ onClose });
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Take Two' }).length).toBeGreaterThan(0);
    await act(async () => { sessionChanged('user-a'); });
    await act(async () => { sessionChanged(null); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Take Two' })).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles Quick Read quota/network failures without exposing sensitive state', async () => {
    mockedStart.mockRejectedValueOnce(new Error('You have used your 3 Quick Reads for today.'));
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Quick Read paused safely.' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Take Two' })).toHaveLength(0);
  });

  it('supports cancel and Done through the existing close path', async () => {
    const onClose = jest.fn();
    const renderer = renderFlow({ onClose });
    await press(renderer, 'Not now');
    expect(onClose).toHaveBeenCalledTimes(1);
    await press(renderer, 'Upload & get my Quick Read');
    await press(renderer, 'Done');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale result after the take identity changes', async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof startQuickRead>>) => void;
    mockedStart.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    const renderer = renderFlow();
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).props.onPress();
      await Promise.resolve();
      renderer.update(React.createElement(QuickReadFlow, props({ takeId: 'take-b', attemptId: 'server-b', audioUri: 'blob:b' })));
    });
    await act(async () => {
      resolveFirst({ runId: 'run-a', result });
      await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quick Read scores' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).length).toBeGreaterThan(0);
  });
});
