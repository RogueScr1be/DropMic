import React from 'react';
import { Animated } from 'react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { DropWait } from './DropWait';

describe('DropWait', () => {
  it('uses the DropMic wait animation in normal motion and stops it on unmount', () => {
    const animation = { start: jest.fn(), stop: jest.fn() } as unknown as ReturnType<typeof Animated.loop>;
    const loopSpy = jest.spyOn(Animated, 'loop').mockReturnValue(animation);
    let tree!: ReturnType<typeof create>;

    act(() => {
      tree = create(React.createElement(DropWait, { reducedMotion: false }));
    });

    expect(tree.root.findByProps({ testID: 'drop-wait' })).toBeTruthy();
    expect(tree.root.findByProps({ children: 'Analyzing Drop' })).toBeTruthy();
    expect(loopSpy).toHaveBeenCalledTimes(1);
    expect(animation.start).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
    expect(animation.stop).toHaveBeenCalledTimes(1);
    loopSpy.mockRestore();
  });

  it('renders a stable final state with Reduced Motion', () => {
    const loopSpy = jest.spyOn(Animated, 'loop');
    let tree!: ReturnType<typeof create>;

    act(() => {
      tree = create(React.createElement(DropWait, { reducedMotion: true }));
    });

    expect(tree.root.findByProps({ accessibilityLabel: 'Analyzing Drop' })).toBeTruthy();
    expect(loopSpy).not.toHaveBeenCalled();
    loopSpy.mockRestore();
  });
});
