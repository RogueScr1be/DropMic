const CORE_TASK_PROMPTS: Record<string, string> = {
  'dress-code-schools': 'Should there be a dress code in schools?',
  'favorite-animal': 'Why is your favorite animal the best one?',
  'hot-dog-sandwich': 'Is a hot dog a sandwich? Explain your logic.',
  'friends-with-ex': 'Is it okay to stay friends with an ex?',
  'health-care-human-right': 'Should health care be a human right?',
  'gap-year-required': 'Should a gap year be required for everyone?',
  'book-smart-street-smart': 'Is book smart better than street smart?',
  'video-games-school-sport': 'Should video games be a school sport?',
  'social-media-net-positive': 'Is social media a net positive or negative?',
  'best-superpower': 'What is the best superpower to have and why?',
  'pineapple-pizza': 'Does pineapple belong on pizza? Tell us why.',
  'grades-intelligence': 'Do grades actually show how smart you are?',
  'past-or-future': 'Would you rather visit the past or future?',
  'cereal-soup': 'Is cereal a soup? Defend your answer.',
  'worst-internet-trend': 'What is the worst internet trend right now?',
  'teen-curfews': 'Should teenagers have strict daily curfews?',
  'college-athletes-paid': 'Should college athletes be paid to play?',
  'overrated-movie': 'What is the most overrated movie ever made?',
  'aliens-visit': 'If aliens visit, what should we show them?',
  'school-uniforms': 'Are school uniforms a good or bad idea?',
};

export function getCoreTaskPrompt(topicId: string) {
  return CORE_TASK_PROMPTS[topicId] ?? null;
}
