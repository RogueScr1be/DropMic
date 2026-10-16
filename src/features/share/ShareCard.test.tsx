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
        speakerVibe: 'The Explorer',
      }));
    });

    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'I scored 84%. Can you beat that?')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'SPEAK UP')).toBe(false);
  });

  it('does not invent a score when the card has no Quick Read result', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(ShareCard, { prompt: 'What changed your mind?' }));
    });

    const copy = tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    expect(copy).toContain('Can you take this prompt?');
    expect(copy).not.toContain('I scored');
  });
});
