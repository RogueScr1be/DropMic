export type SpeakingTopic = {
  id: string;
  prompt: string;
  category: string;
};

export const TOPIC_CATALOG: readonly SpeakingTopic[] = [
  {
    id: 'dress-code-schools',
    category: 'Debate',
    prompt: 'Should there be a dress code in schools?',
  },
  {
    id: 'favorite-animal',
    category: 'Playful',
    prompt: 'Why is your favorite animal the best one?',
  },
  {
    id: 'hot-dog-sandwich',
    category: 'Playful',
    prompt: 'Is a hot dog a sandwich? Explain your logic.',
  },
  {
    id: 'friends-with-ex',
    category: 'Perspective',
    prompt: 'Is it okay to stay friends with an ex?',
  },
  {
    id: 'health-care-human-right',
    category: 'Debate',
    prompt: 'Should health care be a human right?',
  },
  {
    id: 'gap-year-required',
    category: 'Debate',
    prompt: 'Should a gap year be required for everyone?',
  },
  {
    id: 'book-smart-street-smart',
    category: 'Perspective',
    prompt: 'Is book smart better than street smart?',
  },
  {
    id: 'video-games-school-sport',
    category: 'Debate',
    prompt: 'Should video games be a school sport?',
  },
  {
    id: 'social-media-net-positive',
    category: 'Perspective',
    prompt: 'Is social media a net positive or negative?',
  },
  {
    id: 'best-superpower',
    category: 'Imagination',
    prompt: 'What is the best superpower to have and why?',
  },
  {
    id: 'pineapple-pizza',
    category: 'Playful',
    prompt: 'Does pineapple belong on pizza? Tell us why.',
  },
  {
    id: 'grades-intelligence',
    category: 'Perspective',
    prompt: 'Do grades actually show how smart you are?',
  },
  {
    id: 'past-or-future',
    category: 'Imagination',
    prompt: 'Would you rather visit the past or future?',
  },
  {
    id: 'cereal-soup',
    category: 'Playful',
    prompt: 'Is cereal a soup? Defend your answer.',
  },
  {
    id: 'worst-internet-trend',
    category: 'Perspective',
    prompt: 'What is the worst internet trend right now?',
  },
  {
    id: 'teen-curfews',
    category: 'Debate',
    prompt: 'Should teenagers have strict daily curfews?',
  },
  {
    id: 'college-athletes-paid',
    category: 'Debate',
    prompt: 'Should college athletes be paid to play?',
  },
  {
    id: 'overrated-movie',
    category: 'Perspective',
    prompt: 'What is the most overrated movie ever made?',
  },
  {
    id: 'aliens-visit',
    category: 'Imagination',
    prompt: 'If aliens visit, what should we show them?',
  },
  {
    id: 'school-uniforms',
    category: 'Debate',
    prompt: 'Are school uniforms a good or bad idea?',
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
