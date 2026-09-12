import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { HoldToCancel, HOLD_TO_CANCEL_MS } from './HoldToCancel';

describe('HoldToCancel', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets progress when released before the threshold', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    const onHoldRelease = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} onHoldRelease={onHoldRelease} reducedMotion={false} />);
    });

    act(() => {
      tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressIn();
      jest.advanceTimersByTime(400);
    });
    act(() => {
      tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressOut();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onHoldRelease).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel-progress' }).props.style[1]).toEqual({ width: '0%' });
  });

  it('fires cancel once after a continuous hold', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} reducedMotion={false} />);
    });

    act(() => {
      tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressIn();
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS + 100);
      tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressOut();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opens confirmation without cancelling', () => {
    const onCancel = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} reducedMotion />);
    });

    act(() => {
      tree.root.findByProps({ testID: 'confirm-cancel-recording' }).props.onPress();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'cancel-recording-confirmation' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: 'Keep Recording' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: 'Delete Recording' })).toBeTruthy();
  });

  it('keeps the paused recording when confirmation is dismissed', () => {
    const onCancel = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} reducedMotion />);
    });

    act(() => {
      tree.root.findByProps({ testID: 'confirm-cancel-recording' }).props.onPress();
    });
    act(() => {
      tree.root.findByProps({ testID: 'keep-recording' }).props.onPress();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(tree!.root.findAllByProps({ testID: 'cancel-recording-confirmation' })).toHaveLength(0);
  });

  it('shares the guarded cancellation path for hold and confirmation', () => {
    jest.useFakeTimers();
    const holdCancel = jest.fn();
    const confirmCancel = jest.fn();
    let holdTree: ReactTestRenderer;
    let confirmTree: ReactTestRenderer;

    act(() => {
      holdTree = create(<HoldToCancel onCancel={holdCancel} reducedMotion={false} />);
      confirmTree = create(<HoldToCancel onCancel={confirmCancel} reducedMotion={false} />);
    });

    act(() => {
      holdTree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressIn();
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS + 100);
      holdTree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressOut();
    });
    act(() => {
      confirmTree.root.findByProps({ testID: 'confirm-cancel-recording' }).props.onPress();
    });
    act(() => {
      confirmTree.root.findByProps({ testID: 'delete-recording-confirmed' }).props.onPress();
      confirmTree.root.findByProps({ testID: 'delete-recording-confirmed' }).props.onPress();
    });

    expect(holdCancel).toHaveBeenCalledTimes(1);
    expect(confirmCancel).toHaveBeenCalledTimes(1);
  });

  it('preserves confirmation state with reduced motion', () => {
    const onCancel = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} reducedMotion />);
    });

    act(() => {
      tree.root.findByProps({ testID: 'confirm-cancel-recording' }).props.onPress();
    });

    expect(tree!.root.findAllByProps({ testID: 'cancel-recording-confirmation' }).length).toBeGreaterThan(0);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
