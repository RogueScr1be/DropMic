import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from '@jest/globals';

import { ShareCard } from './ShareCard';

describe('challenge share card copy', () => {
  it('uses the result score without the retired challenge badge', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(ShareCard, {
        dropScore: 84,
        prompt: 'What changed your mind?',
      }));
    });

    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Your turn: take the prompt.')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => String(node.props.children).includes('I scored'))).toBe(false);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'SPEAK UP')).toBe(false);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'SPEAKER VIBE')).toBe(false);
  });

  it('does not invent a score when the card has no Quick Read result', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(ShareCard, { prompt: 'What changed your mind?' }));
    });

    const copy = tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    expect(copy).toContain('Your turn: take the prompt.');
    expect(copy).not.toContain('I scored');
  });
});
