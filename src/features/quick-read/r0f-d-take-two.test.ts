import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createTakeTwoTake } from './take-two-journey';

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

  it('keeps Free and anonymous users free of a CTA, including eligibility failure', async () => {
    mockedEligibility.mockResolvedValue(false);
    const free = renderFlow();
    await press(free, 'Upload & get my Quick Read');
    expect(free.root.findAllByProps({ accessibilityLabel: 'Take Two' })).toHaveLength(0);

    mockedEligibility.mockResolvedValue(false);
    const anonymous = renderFlow({ takeId: 'take-b' });
    await press(anonymous, 'Upload & get my Quick Read');
    expect(anonymous.root.findAllByProps({ accessibilityLabel: 'Take Two' })).toHaveLength(0);
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
