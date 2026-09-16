import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { Animated, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import { CompletionMark } from './CompletionMark';

function renderMark(reducedMotion: boolean) {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(CompletionMark, { reducedMotion }));
  });
  return tree!;
}

describe('CompletionMark', () => {
  it('reaches the completed visual state immediately with Reduced Motion', () => {
    const tree = renderMark(true);
    const checkStyle = StyleSheet.flatten(tree.root.findByProps({ testID: 'completion-mark-check' }).props.style);

    expect(checkStyle.transform).toBeUndefined();
    expect(checkStyle.opacity).toBeUndefined();
    expect(tree.root.findByProps({ testID: 'completion-mark' })).toBeTruthy();
  });

  it('uses a finite opacity-and-scale check entrance in full motion', () => {
    const animation = { start: jest.fn(), stop: jest.fn() } as unknown as ReturnType<typeof Animated.timing>;
    const timingSpy = jest.spyOn(Animated, 'timing').mockImplementation(() => animation);
    const parallelSpy = jest.spyOn(Animated, 'parallel').mockImplementation(() => animation);
    const tree = renderMark(false);
    const checkStyle = StyleSheet.flatten(tree.root.findByProps({ testID: 'completion-mark-check' }).props.style);

    expect(checkStyle.transform).toHaveLength(1);
    expect(checkStyle.transform[0].scale).toBeDefined();
    expect(checkStyle.opacity).toBeDefined();
    expect(timingSpy).toHaveBeenCalledTimes(3);
    expect(parallelSpy).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});
