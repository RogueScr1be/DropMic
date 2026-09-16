import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  consumeTakeIdentity,
  createConsumedTakeIdentity,
  createPendingTakeIdentity,
  createTakeIdentity,
  prepareIdentityForRecording,
} from './attempt-identity';

/* eslint-disable import/first */

jest.mock('./quick-read-service', () => ({
  startQuickRead: jest.fn(),
}));

import { QuickReadFlow } from './QuickReadFlow';
import { startQuickRead } from './quick-read-service';

const mockedStartQuickRead = startQuickRead as jest.MockedFunction<typeof startQuickRead>;

const result = {
  clarity: 0.8,
  structure: 0.7,
  specificity: 0.6,
  concision: 0.9,
  strength: 'Clear opening.',
  improvement: 'Add one example.',
  nextDrill: 'Answer with one example and a closing sentence.',
};

function props(overrides: Partial<React.ComponentProps<typeof QuickReadFlow>> = {}): React.ComponentProps<typeof QuickReadFlow> {
  return {
    attemptId: 'server-a',
    audioExtension: 'wav',
    audioUri: 'blob:a',
    idempotencyKey: 'key-a',
    onClose: jest.fn(),
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

describe('Quick Read attempt identity isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStartQuickRead.mockResolvedValue({ runId: 'run-1', result });
  });

  it('reuses the server attempt and idempotency key for the same take', async () => {
    const renderer = renderFlow();

    await press(renderer, 'Upload & get my Quick Read');
    await press(renderer, 'Done');
    await press(renderer, 'Upload & get my Quick Read');

    expect(mockedStartQuickRead).toHaveBeenCalledTimes(2);
    expect(mockedStartQuickRead.mock.calls[0][0]).toMatchObject({ attemptId: 'server-a', idempotencyKey: 'key-a' });
    expect(mockedStartQuickRead.mock.calls[1][0]).toMatchObject({ attemptId: 'server-a', idempotencyKey: 'key-a' });
  });

  it('does not start a second logical run on a duplicate tap for the same take', async () => {
    let resolveRun!: (value: Awaited<ReturnType<typeof startQuickRead>>) => void;
    mockedStartQuickRead.mockReturnValueOnce(new Promise((resolve) => {
      resolveRun = resolve;
    }));
    const renderer = renderFlow();
    const upload = renderer.root.findByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).props.onPress;

    await act(async () => {
      upload();
      upload();
      await Promise.resolve();
    });

    expect(mockedStartQuickRead).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveRun({ runId: 'run-1', result });
    });
  });

  it('creates a different local take identity when recording again', () => {
    const ids = ['take-a', 'key-a', 'take-b', 'key-b'];
    const createId = jest.fn(() => ids.shift()!);
    const first = createTakeIdentity(createId);
    const second = createTakeIdentity(createId);

    expect(second.clientAttemptId).not.toBe(first.clientAttemptId);
    expect(second.quickReadIdempotencyKey).not.toBe(first.quickReadIdempotencyKey);
  });

  it('keeps an unused identity pending and consumes it exactly once', () => {
    const identity = createTakeIdentity(() => 'take-a');
    const pending = createPendingTakeIdentity(identity);
    const prepared = prepareIdentityForRecording(pending, () => createTakeIdentity(() => 'unused'));

    expect(prepared.rotated).toBe(false);
    expect(prepared.lifecycle).toEqual(pending);
    expect(consumeTakeIdentity(prepared.lifecycle)).toEqual({ identity, status: 'consumed' });
    expect(consumeTakeIdentity({ identity, status: 'consumed' })).toEqual({ identity, status: 'consumed' });
  });

  it('rotates a consumed identity once and leaves the replacement pending', () => {
    const first = createTakeIdentity(() => 'take-a');
    const replacement = createTakeIdentity(() => 'take-b');
    const prepared = prepareIdentityForRecording(
      createConsumedTakeIdentity(first),
      () => replacement,
    );

    expect(prepared).toEqual({ lifecycle: { identity: replacement, status: 'pending' }, rotated: true });
    expect(prepareIdentityForRecording(prepared.lifecycle, () => createTakeIdentity(() => 'take-c'))).toEqual({
      lifecycle: prepared.lifecycle,
      rotated: false,
    });
  });

  it('preserves distinct identities for two completed drops and the same identity for retries', () => {
    const ids = ['take-a', 'key-a', 'take-b', 'key-b'];
    const createId = jest.fn(() => ids.shift()!);
    const first = createPendingTakeIdentity(createTakeIdentity(createId));
    const completedFirst = consumeTakeIdentity(first);
    const second = prepareIdentityForRecording(completedFirst, () => createTakeIdentity(createId));

    expect(second.lifecycle.identity).not.toEqual(first.identity);
    expect(consumeTakeIdentity(second.lifecycle)).toEqual({ ...second.lifecycle, status: 'consumed' });
    expect(second.lifecycle.identity).not.toEqual(completedFirst.identity);
  });

  it('uses a different server attempt for a new take', async () => {
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => {
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b', takeId: 'take-b' })));
    });
    await press(renderer, 'Upload & get my Quick Read');

    expect(mockedStartQuickRead.mock.calls[1][0].attemptId).toBe('server-b');
  });

  it('uses a different idempotency key for a new take', async () => {
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => {
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b', takeId: 'take-b' })));
    });
    await press(renderer, 'Upload & get my Quick Read');

    expect(mockedStartQuickRead.mock.calls[1][0].idempotencyKey).toBe('key-b');
  });

  it('does not reuse a deleted take identity for the next recording', async () => {
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await act(async () => {
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b', takeId: 'take-b' })));
    });
    await press(renderer, 'Upload & get my Quick Read');

    expect(mockedStartQuickRead.mock.calls[1][0]).toMatchObject({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b' });
  });

  it('retains the original identity when retrying Quick Read for the same recording', async () => {
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    await press(renderer, 'Done');
    await press(renderer, 'Upload & get my Quick Read');

    expect(mockedStartQuickRead.mock.calls[1][0]).toMatchObject({ attemptId: 'server-a', audioUri: 'blob:a', idempotencyKey: 'key-a' });
  });

  it('keeps the same take identity across auth conversion for the same recording', async () => {
    const renderer = renderFlow({ attemptId: null });
    await act(async () => {
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-a' })));
    });
    await press(renderer, 'Upload & get my Quick Read');

    expect(mockedStartQuickRead).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'server-a', idempotencyKey: 'key-a' }));
    expect(mockedStartQuickRead).toHaveBeenCalledTimes(1);
  });

  it('does not let a late Take A result overwrite Take B', async () => {
    let resolveA!: (value: Awaited<ReturnType<typeof startQuickRead>>) => void;
    mockedStartQuickRead.mockReturnValueOnce(new Promise((resolve) => {
      resolveA = resolve;
    }));
    const renderer = renderFlow();
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).props.onPress();
      await Promise.resolve();
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b', takeId: 'take-b' })));
    });
    await act(async () => {
      resolveA({ runId: 'run-a', result });
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quick Read scores' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).length).toBeGreaterThan(0);
  });

  it('clears the previous result when new audio becomes current', async () => {
    const renderer = renderFlow();
    await press(renderer, 'Upload & get my Quick Read');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quick Read scores' }).length).toBeGreaterThan(0);

    await act(async () => {
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b', takeId: 'take-b' })));
    });

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quick Read scores' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).length).toBeGreaterThan(0);
  });

  it('does not let a late Take A error overwrite Take B', async () => {
    let rejectA!: (error: Error) => void;
    mockedStartQuickRead.mockReturnValueOnce(new Promise((_, reject) => {
      rejectA = reject;
    }));
    const renderer = renderFlow();
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).props.onPress();
      await Promise.resolve();
      renderer.update(React.createElement(QuickReadFlow, props({ attemptId: 'server-b', audioUri: 'blob:b', idempotencyKey: 'key-b', takeId: 'take-b' })));
    });
    await act(async () => {
      rejectA(new Error('Take A failed'));
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Quick Read paused safely.' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Upload & get my Quick Read' }).length).toBeGreaterThan(0);
  });
});
