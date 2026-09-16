import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { SettingsSheet } from './SettingsSheet';
import { getSession } from '@/features/auth/auth-service';

jest.mock('@/features/auth/auth-service', () => ({
  AuthServiceError: class AuthServiceError extends Error {},
  deleteAccount: jest.fn(async () => undefined),
  getSession: jest.fn(),
  signOut: jest.fn(async () => undefined),
}));

const mockedGetSession = getSession as jest.MockedFunction<typeof getSession>;

function textContent(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (!node || typeof node !== 'object') {
    return '';
  }
  const children = (node as { children?: unknown[] }).children ?? [];
  return children.map(textContent).join(' ');
}

describe('SettingsSheet', () => {
  it('surfaces returning-user sign-in for anonymous/local state', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { is_anonymous: true } } as never);
    const onOpenSignIn = jest.fn();
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(React.createElement(SettingsSheet, {
        onClose: jest.fn(),
        onOpenSignIn,
        onSignedOut: jest.fn(),
        visible: true,
      }));
    });

    expect(textContent(renderer!.toJSON())).toContain('record anonymously');
    const signIn = renderer!.root.findByProps({ accessibilityLabel: 'Returning user? Sign in' });
    act(() => signIn.props.onPress());
    expect(onOpenSignIn).toHaveBeenCalledTimes(1);
  });

  it('keeps destructive account deletion behind a second action', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { is_anonymous: false } } as never);
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(React.createElement(SettingsSheet, {
        onClose: jest.fn(),
        onOpenSignIn: jest.fn(),
        onSignedOut: jest.fn(),
        visible: true,
      }));
    });

    expect(textContent(renderer!.toJSON())).not.toContain('Delete account metadata');
    act(() => renderer!.root.findByProps({ accessibilityLabel: 'Delete account' }).props.onPress());
    expect(textContent(renderer!.toJSON())).toContain('Delete account metadata');
  });

  it('closes without invoking returning-user or account actions', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { is_anonymous: true } } as never);
    const onClose = jest.fn();
    const onOpenSignIn = jest.fn();
    const onSignedOut = jest.fn();
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(React.createElement(SettingsSheet, {
        onClose,
        onOpenSignIn,
        onSignedOut,
        visible: true,
      }));
    });

    act(() => renderer!.root.findByProps({ accessibilityLabel: 'Close Settings' }).props.onPress());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenSignIn).not.toHaveBeenCalled();
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
