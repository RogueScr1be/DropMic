export type SpeakingTopic = {
  id: string;
  prompt: string;
  category: string;
};

export const TOPIC_CATALOG: readonly SpeakingTopic[] = [
  {
    id: 'small-joy',
    category: 'Everyday',
    prompt: 'What is a small joy you make time for?',
  },
  {
    id: 'useful-invention',
    category: 'Curiosity',
    prompt: 'Which everyday invention deserves more credit?',
  },
  {
    id: 'changed-mind',
    category: 'Perspective',
    prompt: 'What is something you changed your mind about?',
  },
  {
    id: 'perfect-day',
    category: 'Story',
    prompt: 'Describe a perfect day from start to finish.',
  },
  {
    id: 'teach-anyone',
    category: 'Experience',
    prompt: 'What could you teach someone in ten minutes?',
  },
  {
    id: 'future-letter',
    category: 'Imagination',
    prompt: 'What would you tell your future self today?',
  },
] as const;

function normalizeSeed(seed: number) {
  return Math.abs(Math.trunc(seed)) % TOPIC_CATALOG.length;
}

export function selectTopic(seed: number, previousTopicId?: string | null): SpeakingTopic {
  if (TOPIC_CATALOG.length === 0) {
    throw new Error('Topic catalog cannot be empty.');
  }

  let index = normalizeSeed(seed);
  if (TOPIC_CATALOG[index].id === previousTopicId) {
    index = (index + 1) % TOPIC_CATALOG.length;
  }

  return TOPIC_CATALOG[index];
}

export function selectNextTopic(previousTopicId: string | null, seed = Date.now()) {
  return selectTopic(seed, previousTopicId);
}
