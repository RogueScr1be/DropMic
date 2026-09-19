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
  isDevTestLoginEnabled: jest.fn(() => false),
  signInWithDevTestAccount: jest.fn<() => Promise<{ user: { is_anonymous: false } }>>().mockResolvedValue({ user: { is_anonymous: false } }),
  signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  verifyEmailConversion: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  verifyEmailSignIn: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// eslint-disable-next-line import/first
import { SignupFlow } from './SignupFlow';

const authServiceMocks = jest.requireMock('./auth-service') as {
  isDevTestLoginEnabled: { mockReturnValue: (value: boolean) => void };
  signInWithDevTestAccount: {
    mockResolvedValue: (value: unknown) => void;
    mockRejectedValueOnce: (value: unknown) => void;
    mockClear: () => void;
    mock: { calls: unknown[][] };
  };
};
const mockIsDevTestLoginEnabled = authServiceMocks.isDevTestLoginEnabled;
const mockSignInWithDevTestAccount = authServiceMocks.signInWithDevTestAccount;

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

async function renderOtpFlow({ devLoginEnabled = false, onDeveloperLogin = jest.fn() } = {}) {
  mockIsDevTestLoginEnabled.mockReturnValue(devLoginEnabled);
  mockSignInWithDevTestAccount.mockResolvedValue({ user: { is_anonymous: false } });
  const onClose = jest.fn();
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(React.createElement(SignupFlow, {
      attempt,
      onClose,
      onDeveloperLogin,
      onSignedOut: jest.fn(),
      visible: true,
    }));
    await Promise.resolve();
  });
  act(() => {
    tree!.root.findByProps({ accessibilityLabel: 'Sign In' }).props.onPress();
  });
  await act(async () => {
    const emailInput = tree!.root.findByProps({ placeholder: 'you@example.com' });
    emailInput.props.onChangeText('owner@example.com');
    tree!.root.findByProps({ accessibilityLabel: 'Send email code' }).props.onPress();
    await Promise.resolve();
  });
  return { tree: tree!, onClose, onDeveloperLogin };
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

  it('hides the development action unless both runtime guards are active', async () => {
    const { tree } = await renderOtpFlow();
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Use Dev Test Account' })).toHaveLength(0);
    act(() => tree.unmount());

    const guarded = await renderOtpFlow({ devLoginEnabled: true });
    expect(guarded.tree.root.findAllByProps({ accessibilityLabel: 'Use Dev Test Account' }).length).toBeGreaterThan(0);
    act(() => guarded.tree.unmount());
  });

  it('opens a secure form, submits once, and does not claim the existing take', async () => {
    const onDeveloperLogin = jest.fn();
    const { tree, onClose } = await renderOtpFlow({ devLoginEnabled: true, onDeveloperLogin });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Use Dev Test Account' }).props.onPress());
    const passwordInput = tree.root.findByProps({ accessibilityLabel: 'Development test account password' });
    expect(passwordInput.props.secureTextEntry).toBe(true);
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Development test account email' }).props.onChangeText('owner@example.com');
      passwordInput.props.onChangeText('owner-input');
    });
    await act(async () => {
      const submit = tree.root.findByProps({ accessibilityLabel: 'Sign In for Testing' }).props.onPress;
      submit();
      submit();
      await Promise.resolve();
    });
    expect(mockSignInWithDevTestAccount).toHaveBeenCalledTimes(1);
    expect(onDeveloperLogin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Sign In for Testing' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('clears the password after failure and keeps the form open', async () => {
    mockSignInWithDevTestAccount.mockRejectedValueOnce(new Error('failed'));
    const { tree, onClose } = await renderOtpFlow({ devLoginEnabled: true });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Use Dev Test Account' }).props.onPress());
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Development test account email' }).props.onChangeText('owner@example.com');
      tree.root.findByProps({ accessibilityLabel: 'Development test account password' }).props.onChangeText('owner-input');
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Sign In for Testing' }).props.onPress();
      await Promise.resolve();
    });
    expect(tree.root.findByProps({ accessibilityLabel: 'Development test account password' }).props.value).toBe('');
    expect(onClose).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('clears development credentials when returning to the code form', async () => {
    const { tree } = await renderOtpFlow({ devLoginEnabled: true });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Use Dev Test Account' }).props.onPress());
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Development test account email' }).props.onChangeText('owner@example.com');
      tree.root.findByProps({ accessibilityLabel: 'Development test account password' }).props.onChangeText('owner-input');
    });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Back to Code' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: 'Use Dev Test Account' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: 'Development test account email' }).props.value).toBe('');
    expect(tree.root.findByProps({ accessibilityLabel: 'Development test account password' }).props.value).toBe('');
    act(() => tree.unmount());
  });
});
