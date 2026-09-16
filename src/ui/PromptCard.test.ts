import React from 'react';
import { describe, expect, it } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { TOPIC_CATALOG } from '@/features/topics/topic-catalog';

import { PromptCard } from './PromptCard';
import { colors, spacing, typography } from './theme';

describe('PromptCard', () => {
  function renderPrompt(prompt: string) {
    let tree: ReturnType<typeof create>;

    act(() => {
      tree = create(React.createElement(PromptCard, { prompt }));
    });

    return tree!.root;
  }

  function inspectPrompt(prompt: string) {
    const root = renderPrompt(prompt);
    const card = root.findByProps({ testID: 'speaking-prompt' });
    const texts = root.findAllByType(Text);

    return {
      card,
      cardStyle: StyleSheet.flatten(card.props.style),
      closingStyle: StyleSheet.flatten(texts[2].props.style),
      openingStyle: StyleSheet.flatten(texts[0].props.style),
      promptStyle: StyleSheet.flatten(texts[1].props.style),
      texts,
    };
  }

  it.each([
    ['shortest catalog prompt', TOPIC_CATALOG.reduce((shortest, topic) => topic.prompt.length < shortest.prompt.length ? topic : shortest).prompt],
    ['longest catalog prompt', TOPIC_CATALOG.reduce((longest, topic) => topic.prompt.length > longest.prompt.length ? topic : longest).prompt],
    ['explicit multiline prompt', 'Can a prompt wrap across\nmultiple lines without colliding with punctuation?'],
  ])('keeps the complete %s in normal flow', (_caseName, prompt) => {
    const { card, cardStyle, closingStyle, openingStyle, promptStyle, texts } = inspectPrompt(prompt);

    expect(texts.map((text) => text.props.children)).toEqual(['“', prompt, '”']);
    expect(card.props.accessibilityLabel).toBe(`Speaking prompt: ${prompt}`);
    expect(texts[0].props.accessibilityElementsHidden).toBe(true);
    expect(texts[1].props.accessibilityElementsHidden).toBeUndefined();
    expect(texts[2].props.accessibilityElementsHidden).toBe(true);
    expect(closingStyle).toMatchObject({
      alignSelf: 'flex-end',
      color: openingStyle.color,
      fontFamily: typography.displayFamily,
      fontSize: openingStyle.fontSize,
      lineHeight: openingStyle.lineHeight,
    });
    expect(closingStyle.position).toBeUndefined();
    expect(closingStyle.bottom).toBeUndefined();
    expect(closingStyle.right).toBeUndefined();
    expect(promptStyle.position).toBeUndefined();
    expect(cardStyle).toMatchObject({ paddingBottom: spacing.xxxl, paddingRight: spacing.xxxl });
  });

  it('keeps one accessible prompt while decorative quotes stay hidden at larger text sizes', () => {
    const prompt = 'Does the final punctuation remain outside the closing quote region?';
    const { card, closingStyle, openingStyle, promptStyle, texts } = inspectPrompt(prompt);

    expect(card.props.accessibilityLabel).toBe(`Speaking prompt: ${prompt}`);
    expect(texts.filter((text) => text.props.accessibilityElementsHidden !== true)).toHaveLength(1);
    expect(texts[0].props.maxFontSizeMultiplier).toBe(1);
    expect(texts[2].props.maxFontSizeMultiplier).toBe(1);
    expect(texts[1].props.maxFontSizeMultiplier).toBe(1.5);
    expect(closingStyle).toMatchObject({
      alignSelf: 'flex-end',
      color: openingStyle.color,
      fontFamily: typography.displayFamily,
      fontSize: openingStyle.fontSize,
      lineHeight: openingStyle.lineHeight,
    });
    expect(promptStyle).toMatchObject({
      color: colors.inkStrong,
      fontFamily: typography.displayFamily,
    });
  });
});
