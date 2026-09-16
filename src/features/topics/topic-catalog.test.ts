import { describe, expect, it } from '@jest/globals';

import { TOPIC_CATALOG, selectNextTopic, selectTopic } from './topic-catalog';

describe('topic catalog', () => {
  it('contains the exact ordered QA7 prompt catalog', () => {
    expect(TOPIC_CATALOG).toHaveLength(20);
    expect(TOPIC_CATALOG.map((topic) => topic.prompt)).toEqual([
      'Should there be a dress code in schools?',
      'Why is your favorite animal the best one?',
      'Is a hot dog a sandwich? Explain your logic.',
      'Is it okay to stay friends with an ex?',
      'Should health care be a human right?',
      'Should a gap year be required for everyone?',
      'Is book smart better than street smart?',
      'Should video games be a school sport?',
      'Is social media a net positive or negative?',
      'What is the best superpower to have and why?',
      'Does pineapple belong on pizza? Tell us why.',
      'Do grades actually show how smart you are?',
      'Would you rather visit the past or future?',
      'Is cereal a soup? Defend your answer.',
      'What is the worst internet trend right now?',
      'Should teenagers have strict daily curfews?',
      'Should college athletes be paid to play?',
      'What is the most overrated movie ever made?',
      'If aliens visit, what should we show them?',
      'Are school uniforms a good or bad idea?',
    ]);
  });

  it('selects deterministically from a seed', () => {
    expect(selectTopic(4)).toEqual(selectTopic(4));
    expect(selectTopic(4).id).toBe(TOPIC_CATALOG[4].id);
  });

  it('avoids immediately repeating the previous topic', () => {
    const first = selectTopic(2);
    const next = selectNextTopic(first.id, 2);

    expect(next.id).not.toBe(first.id);
  });

  it('keeps seeded New Drop selection local and repeatable', () => {
    const previous = TOPIC_CATALOG[1];

    expect(selectNextTopic(previous.id, 17)).toEqual(selectNextTopic(previous.id, 17));
    expect(selectNextTopic(previous.id, 17).id).not.toBe(previous.id);
  });

  it('normalizes negative and decimal seeds', () => {
    expect(selectTopic(-1)).toEqual(selectTopic(1));
    expect(selectTopic(2.9)).toEqual(selectTopic(2));
  });
});
