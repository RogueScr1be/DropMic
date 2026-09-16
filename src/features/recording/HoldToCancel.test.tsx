import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { HoldToCancel, HOLD_TO_CANCEL_MS } from './HoldToCancel';

function pressIn(tree: ReactTestRenderer) {
  tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressIn();
}

function pressOut(tree: ReactTestRenderer) {
  tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onPressOut();
}

describe('HoldToCancel', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders only the direct hold control with button semantics and a destructive hint', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={jest.fn()} reducedMotion={false} />);
    });

    expect(tree!.root.findByProps({ testID: 'hold-to-cancel' }).props.accessibilityRole).toBe('button');
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel' }).props.accessibilityLabel).toBe('Hold to Cancel');
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel' }).props.accessibilityHint).toContain('cancel and delete');
    expect(tree!.root.findAllByProps({ testID: 'confirm-cancel-recording' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ children: 'Confirm Cancel' })).toHaveLength(0);
  });

  it('starts a hold without deleting immediately', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    const onHoldStart = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} onHoldStart={onHoldStart} reducedMotion={false} />);
    });
    act(() => {
      pressIn(tree);
    });

    act(() => {
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS - 100);
    });

    expect(onHoldStart).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel' }).props.children[0].props.children).toBe('Keep holding to cancel');
  });

  it('preserves the paused recording on early release and permits a later hold', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    const onHoldRelease = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} onHoldRelease={onHoldRelease} reducedMotion={false} />);
    });
    act(() => {
      pressIn(tree);
      jest.advanceTimersByTime(400);
      pressOut(tree);
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onHoldRelease).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel-progress' }).props.style[2]).toEqual({ width: '0%' });

    act(() => {
      pressIn(tree);
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS);
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels exactly at the threshold without waiting for release', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    const onHoldRelease = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} onHoldRelease={onHoldRelease} reducedMotion={false} />);
    });
    act(() => {
      pressIn(tree);
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS);
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onHoldRelease).not.toHaveBeenCalled();

    act(() => {
      pressOut(tree);
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS);
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onHoldRelease).not.toHaveBeenCalled();
  });

  it('guards rapid repeated input against duplicate timers and cancellation', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    const onHoldStart = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} onHoldStart={onHoldStart} reducedMotion={false} />);
    });
    act(() => {
      pressIn(tree);
      pressIn(tree);
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS);
      pressOut(tree);
      pressOut(tree);
    });

    expect(onHoldStart).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cleans the timer and progress when the gesture is interrupted', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    const onHoldRelease = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} onHoldRelease={onHoldRelease} reducedMotion={false} />);
    });
    act(() => {
      pressIn(tree);
      jest.advanceTimersByTime(400);
      tree.root.findByProps({ testID: 'hold-to-cancel' }).props.onResponderTerminate();
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS);
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onHoldRelease).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel-progress' }).props.style[2]).toEqual({ width: '0%' });
  });

  it('cleans the timer on unmount', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} reducedMotion={false} />);
    });
    act(() => {
      pressIn(tree);
      jest.advanceTimersByTime(400);
    });
    act(() => {
      tree.unmount();
    });
    act(() => {
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS);
    });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the 1,500ms threshold with reduced motion and uses a non-animated pressed state', () => {
    jest.useFakeTimers();
    const onCancel = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(<HoldToCancel onCancel={onCancel} reducedMotion />);
    });
    act(() => {
      pressIn(tree);
      jest.advanceTimersByTime(HOLD_TO_CANCEL_MS - 1);
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'hold-to-cancel-progress' }).props.style[1]).toEqual({ opacity: 0 });

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
