import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { useAuthFlowStore } from './auth-flow-store';
import type { UnclaimedAttempt } from './auth-recovery';

jest.mock('./auth-recovery', () => ({
  authFlowResumeStep: jest.fn<() => 'explanation'>().mockReturnValue('explanation'),
  getPendingAuth: jest.fn<() => Promise<null>>().mockResolvedValue(null),
}));

jest.mock('./auth-service', () => ({
  AuthServiceError: class AuthServiceError extends Error {},
  beginEmailConversion: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  beginEmailSignIn: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  claimUnclaimedAttempt: jest.fn<() => Promise<string>>().mockResolvedValue('attempt-1'),
  deleteAccount: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getSession: jest.fn<() => Promise<null>>().mockResolvedValue(null),
  signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  verifyEmailConversion: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  verifyEmailSignIn: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// eslint-disable-next-line import/first
import { SignupFlow } from './SignupFlow';

const attempt: UnclaimedAttempt = {
  audioRetained: false,
  clientAttemptId: 'attempt-1',
  completedAt: new Date(0).toISOString(),
  completedDurationSeconds: 30,
  selectedDurationSeconds: 30,
  topicId: 'topic-1',
};

async function renderSignupFlow() {
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(React.createElement(SignupFlow, {
      attempt,
      onClose: jest.fn(),
      onSignedOut: jest.fn(),
      visible: true,
    }));
    await Promise.resolve();
  });
  return tree!;
}

describe('SignupFlow QA7 copy and transitions', () => {
  beforeEach(() => {
    act(() => {
      useAuthFlowStore.getState().reset();
    });
  });

  it('uses Join DropMic copy and keeps Sign Up on the email continuation', async () => {
    const tree = await renderSignupFlow();
    const labels = new Set(tree.root.findAllByProps({ accessibilityRole: 'button' }).map((button) => button.props.accessibilityLabel));

    expect(labels).toEqual(new Set(['Close account setup', 'Sign Up', 'Sign In']));
    expect(tree.root.findByProps({ children: 'Join DropMic' })).toBeTruthy();
    expect(tree.root.findAllByProps({ children: 'Use a new email to keep this saved take attached to the same anonymous owner. Existing accounts should sign in before recording a new Drop.' })).toHaveLength(0);

    act(() => {
      tree.root.findAllByProps({ accessibilityLabel: 'Sign Up' })[0].props.onPress();
    });

    expect(useAuthFlowStore.getState().step).toBe('email');
    act(() => {
      tree.unmount();
    });
  });

  it('routes Sign In into the existing sign_in_email flow', async () => {
    const tree = await renderSignupFlow();

    act(() => {
      tree.root.findAllByProps({ accessibilityLabel: 'Sign In' })[0].props.onPress();
    });

    expect(useAuthFlowStore.getState().step).toBe('sign_in_email');
    act(() => {
      tree.unmount();
    });
  });
});
