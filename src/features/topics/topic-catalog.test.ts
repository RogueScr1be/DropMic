import { describe, expect, it } from '@jest/globals';

import { TOPIC_CATALOG, selectNextTopic, selectTopic } from './topic-catalog';

describe('topic catalog', () => {
  it('selects deterministically from a seed', () => {
    expect(selectTopic(4)).toEqual(selectTopic(4));
    expect(selectTopic(4).id).toBe(TOPIC_CATALOG[4].id);
  });

  it('avoids immediately repeating the previous topic', () => {
    const first = selectTopic(2);
    const next = selectNextTopic(first.id, 2);

    expect(next.id).not.toBe(first.id);
  });

  it('normalizes negative and decimal seeds', () => {
    expect(selectTopic(-1)).toEqual(selectTopic(1));
    expect(selectTopic(2.9)).toEqual(selectTopic(2));
  });
});
