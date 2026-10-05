import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { ChallengeTransitionView } from './ChallengeTransitionView';

describe('ChallengeTransitionView', () => {
  it('keeps preparation visible while async work is pending', () => {
    let tree!: ReturnType<typeof create>;

    act(() => {
      tree = create(React.createElement(ChallengeTransitionView, {
        onDismiss: jest.fn(),
        state: { stage: 'challenge_resolution_started', status: 'preparing' },
      }));
    });

    expect(tree.root.findByProps({ testID: 'challenge-transition-view' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityRole: 'header' }).props.children).toContain('Preparing');
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Back to DropMic' })).toHaveLength(0);
  });

  it('shows a recoverable error action instead of a blank surface', () => {
    const onDismiss = jest.fn();
    let tree!: ReturnType<typeof create>;

    act(() => {
      tree = create(React.createElement(ChallengeTransitionView, {
        onDismiss,
        state: { message: 'This challenge is unavailable.', stage: 'transition_failed', status: 'error' },
      }));
    });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Back to DropMic' }).props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
