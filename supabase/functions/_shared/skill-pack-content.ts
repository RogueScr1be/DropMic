export type SkillPackId = 'interview_pro' | 'founder_pitch';
export type SkillPackTopic = {
  id: string;
  prompt: string;
  category: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  challengeReady?: boolean;
};
export type SkillPackDrill = {
  id: string;
  title: string;
  instruction: string;
  topicId: string;
};
export type SkillPack = {
  id: SkillPackId;
  entitlementKey: `pack.${SkillPackId}`;
  productId: `dropmic_pack_${SkillPackId}`;
  packageId: `pack_${SkillPackId}`;
  title: string;
  tagline: string;
  description: string;
  categories: readonly string[];
  terminology: readonly { term: string; meaning: string }[];
  drills: readonly SkillPackDrill[];
  prompts: readonly SkillPackTopic[];
  pressureTest: SkillPackTopic;
  quickReadGuidance: string;
  advancedRubric: {
    version: string;
    criteria: readonly { name: string; description: string }[];
  };
};

export const SKILL_PACKS: readonly SkillPack[] = [
  {
    id: 'interview_pro',
    entitlementKey: 'pack.interview_pro',
    productId: 'dropmic_pack_interview_pro',
    packageId: 'pack_interview_pro',
    title: 'Interview Pro',
    tagline: 'Build answers that are clear, specific, and easy to remember.',
    description: 'A practical interview workout: 40 prompts, five focused drills, five levels of difficulty, and a final pressure test.',
    categories: ['Behavioral', 'Leadership', 'Collaboration', 'Problem Solving', 'Career Growth'],
    terminology: [
      { term: 'Situation', meaning: 'The short context that makes your example understandable.' },
      { term: 'Task', meaning: 'The responsibility or result you were working toward.' },
      { term: 'Action', meaning: 'The choices and work you personally contributed.' },
      { term: 'Result', meaning: 'The observable outcome and what changed afterward.' },
      { term: 'Signal', meaning: 'A concrete detail that supports the point you are making.' },
      { term: 'Trade-off', meaning: 'A benefit you accepted and a cost you managed.' },
    ],
    drills: [
      { id: 'star-60', title: 'The four-beat story', instruction: 'Give one sentence of context, one sentence on your role, two sentences on your actions, and one result.', topicId: 'interview-pro-01' },
      { id: 'ownership', title: 'Make your role clear', instruction: 'Use “I” for your own decisions and “we” for shared outcomes. Name one choice you made.', topicId: 'interview-pro-11' },
      { id: 'evidence', title: 'Add one proof point', instruction: 'Replace a broad claim with one specific example, number, or observable change.', topicId: 'interview-pro-25' },
      { id: 'tradeoff', title: 'Explain the trade-off', instruction: 'Name the option you chose, the option you set aside, and the reason for your choice.', topicId: 'interview-pro-31' },
      { id: 'tight-close', title: 'Land the lesson', instruction: 'End with what you learned and how you would use it in the role you want.', topicId: 'interview-pro-37' },
    ],
    prompts: [
      { id: 'interview-pro-01', category: 'Behavioral', difficulty: 1, challengeReady: true, prompt: 'Tell me about a time you solved a problem that was slowing your team down.' },
      { id: 'interview-pro-02', category: 'Behavioral', difficulty: 1, prompt: 'Describe a piece of feedback that changed how you work.' },
      { id: 'interview-pro-03', category: 'Behavioral', difficulty: 2, prompt: 'Share a time you had to deliver something with very little time.' },
      { id: 'interview-pro-04', category: 'Behavioral', difficulty: 2, prompt: 'Tell me about a mistake you caught and how you handled it.' },
      { id: 'interview-pro-05', category: 'Behavioral', difficulty: 3, prompt: 'Describe a decision you made before you had all the information.' },
      { id: 'interview-pro-06', category: 'Behavioral', difficulty: 3, prompt: 'Tell me about a time you changed your mind after hearing another view.' },
      { id: 'interview-pro-07', category: 'Behavioral', difficulty: 4, prompt: 'Describe a result you are proud of that took longer than expected.' },
      { id: 'interview-pro-08', category: 'Behavioral', difficulty: 5, prompt: 'Tell me about a setback that changed the way you approach your work.' },
      { id: 'interview-pro-09', category: 'Leadership', difficulty: 1, prompt: 'What does good leadership look like when you are not the manager?' },
      { id: 'interview-pro-10', category: 'Leadership', difficulty: 1, prompt: 'Describe a time you helped a group agree on its next step.' },
      { id: 'interview-pro-11', category: 'Leadership', difficulty: 2, challengeReady: true, prompt: 'Tell me about a time you took ownership of a result that was at risk.' },
      { id: 'interview-pro-12', category: 'Leadership', difficulty: 2, prompt: 'How have you helped someone else do their best work?' },
      { id: 'interview-pro-13', category: 'Leadership', difficulty: 3, prompt: 'Describe a moment when you had to set a boundary or reset expectations.' },
      { id: 'interview-pro-14', category: 'Leadership', difficulty: 3, prompt: 'Tell me how you handle a team decision you disagree with.' },
      { id: 'interview-pro-15', category: 'Leadership', difficulty: 4, prompt: 'Describe how you would lead a project with unclear ownership.' },
      { id: 'interview-pro-16', category: 'Leadership', difficulty: 5, prompt: 'Tell me about a time you made a difficult call and explained it to others.' },
      { id: 'interview-pro-17', category: 'Collaboration', difficulty: 1, prompt: 'What helps you work well with someone whose style is different from yours?' },
      { id: 'interview-pro-18', category: 'Collaboration', difficulty: 1, prompt: 'Describe a time you made a teammate’s work easier.' },
      { id: 'interview-pro-19', category: 'Collaboration', difficulty: 2, prompt: 'Tell me about a disagreement you helped move toward a decision.' },
      { id: 'interview-pro-20', category: 'Collaboration', difficulty: 2, prompt: 'How do you make sure quieter teammates can contribute?' },
      { id: 'interview-pro-21', category: 'Collaboration', difficulty: 3, prompt: 'Describe a project where success depended on clear handoffs.' },
      { id: 'interview-pro-22', category: 'Collaboration', difficulty: 3, prompt: 'Tell me about a time you repaired a working relationship.' },
      { id: 'interview-pro-23', category: 'Collaboration', difficulty: 4, prompt: 'How would you respond if a partner team missed a commitment your work depends on?' },
      { id: 'interview-pro-24', category: 'Collaboration', difficulty: 5, prompt: 'Explain how you balance a shared goal with a teammate’s competing priority.' },
      { id: 'interview-pro-25', category: 'Problem Solving', difficulty: 1, prompt: 'Walk me through how you decide what to work on first.' },
      { id: 'interview-pro-26', category: 'Problem Solving', difficulty: 1, prompt: 'Tell me about a small change that made a process better.' },
      { id: 'interview-pro-27', category: 'Problem Solving', difficulty: 2, challengeReady: true, prompt: 'Describe a time the first solution did not work. What did you try next?' },
      { id: 'interview-pro-28', category: 'Problem Solving', difficulty: 2, prompt: 'How do you check whether a problem is a symptom or the real cause?' },
      { id: 'interview-pro-29', category: 'Problem Solving', difficulty: 3, prompt: 'Tell me how you would make progress when the request is not clearly defined.' },
      { id: 'interview-pro-30', category: 'Problem Solving', difficulty: 3, prompt: 'Describe a time you used evidence to choose between two options.' },
      { id: 'interview-pro-31', category: 'Problem Solving', difficulty: 4, prompt: 'Explain a trade-off you made between speed and quality.' },
      { id: 'interview-pro-32', category: 'Problem Solving', difficulty: 5, prompt: 'Tell me how you would recover a project that is behind and short on people.' },
      { id: 'interview-pro-33', category: 'Career Growth', difficulty: 1, prompt: 'What skill are you working to improve, and what is your practice plan?' },
      { id: 'interview-pro-34', category: 'Career Growth', difficulty: 1, prompt: 'What kind of work gives you energy, and why?' },
      { id: 'interview-pro-35', category: 'Career Growth', difficulty: 2, prompt: 'What would you want to learn in your first three months in this role?' },
      { id: 'interview-pro-36', category: 'Career Growth', difficulty: 2, prompt: 'Describe the kind of team where you do your strongest work.' },
      { id: 'interview-pro-37', category: 'Career Growth', difficulty: 3, prompt: 'How does this role connect to the direction you want your career to take?' },
      { id: 'interview-pro-38', category: 'Career Growth', difficulty: 3, prompt: 'Tell me about a goal you set, how you tracked it, and what changed.' },
      { id: 'interview-pro-39', category: 'Career Growth', difficulty: 4, prompt: 'What would you do if the job changed in a way that no longer matched your strengths?' },
      { id: 'interview-pro-40', category: 'Career Growth', difficulty: 5, prompt: 'Make the case for why your next step should be this role, using one example as proof.' },
    ],
    pressureTest: {
      id: 'interview-pro-pressure-test',
      category: 'Pressure Test',
      difficulty: 5,
      prompt: 'You have one minute. A hiring manager says, “Your project missed its target. What happened, what was your part, and what would you change?” Give a direct answer with one specific result.',
    },
    quickReadGuidance: 'For interview practice, focus on a clear situation, the speaker’s own actions, specific evidence, and a concise result. Do not reward polished claims without an example.',
    advancedRubric: {
      version: 'interview-pro.v1',
      criteria: [
        { name: 'Context and stakes', description: 'The example gives only enough context to understand why the work mattered.' },
        { name: 'Personal contribution', description: 'The speaker separates their own decisions from the team’s work.' },
        { name: 'Evidence and result', description: 'The answer includes an observable outcome or specific proof point.' },
        { name: 'Learning and fit', description: 'The close names a useful lesson connected to the role or future work.' },
      ],
    },
  },
  {
    id: 'founder_pitch',
    entitlementKey: 'pack.founder_pitch',
    productId: 'dropmic_pack_founder_pitch',
    packageId: 'pack_founder_pitch',
    title: 'Founder Pitch',
    tagline: 'Explain the problem, the value, and the evidence behind your idea.',
    description: 'A founder’s speaking workout: 40 prompts, five focused drills, five levels of difficulty, and a final pressure test.',
    categories: ['Customer Problem', 'Product Value', 'Market & Alternatives', 'Traction & Evidence', 'Ask & Vision'],
    terminology: [
      { term: 'Ideal customer', meaning: 'The specific group that feels the problem most strongly.' },
      { term: 'Wedge', meaning: 'The small first use case that can earn a place in a larger market.' },
      { term: 'Value proposition', meaning: 'The plain-language outcome a customer gets and why it matters.' },
      { term: 'Traction', meaning: 'Evidence that real people are taking a meaningful action.' },
      { term: 'Retention', meaning: 'Whether customers continue using or paying for the product.' },
      { term: 'Ask', meaning: 'A clear request tied to a concrete next milestone.' },
    ],
    drills: [
      { id: 'customer-one-line', title: 'Name the customer', instruction: 'Start with one customer group and one moment when the problem appears.', topicId: 'founder-pitch-01' },
      { id: 'value-before-features', title: 'Lead with value', instruction: 'State the result for the customer before describing features or technology.', topicId: 'founder-pitch-11' },
      { id: 'evidence-not-hype', title: 'Use one proof point', instruction: 'Replace a large market claim with the strongest evidence you can verify today.', topicId: 'founder-pitch-25' },
      { id: 'alternative-contrast', title: 'Explain the alternative', instruction: 'Name what customers do now and one practical reason your approach is different.', topicId: 'founder-pitch-17' },
      { id: 'milestone-ask', title: 'Make the ask', instruction: 'Ask for one specific next step and say what it will help you learn or deliver.', topicId: 'founder-pitch-37' },
    ],
    prompts: [
      { id: 'founder-pitch-01', category: 'Customer Problem', difficulty: 1, challengeReady: true, prompt: 'Who has the problem you are solving, and when do they feel it most?' },
      { id: 'founder-pitch-02', category: 'Customer Problem', difficulty: 1, prompt: 'Describe one recent moment when a customer ran into this problem.' },
      { id: 'founder-pitch-03', category: 'Customer Problem', difficulty: 2, prompt: 'What do customers do today when this problem gets in their way?' },
      { id: 'founder-pitch-04', category: 'Customer Problem', difficulty: 2, prompt: 'Why is this problem important enough for someone to change their routine?' },
      { id: 'founder-pitch-05', category: 'Customer Problem', difficulty: 3, prompt: 'How did you learn that customers experience this problem often?' },
      { id: 'founder-pitch-06', category: 'Customer Problem', difficulty: 3, prompt: 'Which customer group is the best place to start, and what makes them a fit?' },
      { id: 'founder-pitch-07', category: 'Customer Problem', difficulty: 4, prompt: 'What evidence would change your mind about the size or urgency of this problem?' },
      { id: 'founder-pitch-08', category: 'Customer Problem', difficulty: 5, prompt: 'Explain why this problem matters now without relying on a broad trend claim.' },
      { id: 'founder-pitch-09', category: 'Product Value', difficulty: 1, prompt: 'What does your product help a customer do more easily?' },
      { id: 'founder-pitch-10', category: 'Product Value', difficulty: 1, prompt: 'Describe your product in one sentence without using industry jargon.' },
      { id: 'founder-pitch-11', category: 'Product Value', difficulty: 2, challengeReady: true, prompt: 'What changes for a customer after they use your product?' },
      { id: 'founder-pitch-12', category: 'Product Value', difficulty: 2, prompt: 'Which part of the product creates the most value for a first-time customer?' },
      { id: 'founder-pitch-13', category: 'Product Value', difficulty: 3, prompt: 'What is the smallest version of the product that still solves the core problem?' },
      { id: 'founder-pitch-14', category: 'Product Value', difficulty: 3, prompt: 'Which feature would you remove first, and why would the product still work?' },
      { id: 'founder-pitch-15', category: 'Product Value', difficulty: 4, prompt: 'How would you explain the product’s value to a skeptical first customer?' },
      { id: 'founder-pitch-16', category: 'Product Value', difficulty: 5, prompt: 'Show how the product delivers value in one specific customer workflow.' },
      { id: 'founder-pitch-17', category: 'Market & Alternatives', difficulty: 1, prompt: 'What is the simplest alternative customers use today?' },
      { id: 'founder-pitch-18', category: 'Market & Alternatives', difficulty: 1, prompt: 'What makes your first customer group reachable?' },
      { id: 'founder-pitch-19', category: 'Market & Alternatives', difficulty: 2, prompt: 'Why would a customer choose you over doing nothing for another month?' },
      { id: 'founder-pitch-20', category: 'Market & Alternatives', difficulty: 2, prompt: 'Which existing tool or habit do you expect to replace first?' },
      { id: 'founder-pitch-21', category: 'Market & Alternatives', difficulty: 3, prompt: 'What is your first market wedge, and what could it lead to later?' },
      { id: 'founder-pitch-22', category: 'Market & Alternatives', difficulty: 3, prompt: 'How do you avoid competing only on price?' },
      { id: 'founder-pitch-23', category: 'Market & Alternatives', difficulty: 4, prompt: 'What would make it difficult for a larger company to copy your approach well?' },
      { id: 'founder-pitch-24', category: 'Market & Alternatives', difficulty: 5, prompt: 'Explain the market opportunity using a reachable first segment rather than a giant total-market number.' },
      { id: 'founder-pitch-25', category: 'Traction & Evidence', difficulty: 1, prompt: 'What is one thing you have learned from talking with a potential customer?' },
      { id: 'founder-pitch-26', category: 'Traction & Evidence', difficulty: 1, prompt: 'What is the next customer action you want to observe?' },
      { id: 'founder-pitch-27', category: 'Traction & Evidence', difficulty: 2, prompt: 'What is your strongest evidence that people want this solution?' },
      { id: 'founder-pitch-28', category: 'Traction & Evidence', difficulty: 2, prompt: 'Which number best shows whether your product is helping customers?' },
      { id: 'founder-pitch-29', category: 'Traction & Evidence', difficulty: 3, challengeReady: true, prompt: 'Describe one result so far, what it proves, and what it does not prove yet.' },
      { id: 'founder-pitch-30', category: 'Traction & Evidence', difficulty: 3, prompt: 'What did a failed experiment teach you about the customer or product?' },
      { id: 'founder-pitch-31', category: 'Traction & Evidence', difficulty: 4, prompt: 'How will you tell repeat interest apart from polite early feedback?' },
      { id: 'founder-pitch-32', category: 'Traction & Evidence', difficulty: 5, prompt: 'Explain how you would validate demand before investing in a larger build.' },
      { id: 'founder-pitch-33', category: 'Ask & Vision', difficulty: 1, prompt: 'What is the next milestone you want the business to reach?' },
      { id: 'founder-pitch-34', category: 'Ask & Vision', difficulty: 1, prompt: 'What kind of help would make the biggest difference this month?' },
      { id: 'founder-pitch-35', category: 'Ask & Vision', difficulty: 2, prompt: 'What are you asking from this listener, and why is it useful now?' },
      { id: 'founder-pitch-36', category: 'Ask & Vision', difficulty: 2, prompt: 'What would you do with the next 90 days if you had the right support?' },
      { id: 'founder-pitch-37', category: 'Ask & Vision', difficulty: 3, prompt: 'Connect one near-term milestone to the larger opportunity you see.' },
      { id: 'founder-pitch-38', category: 'Ask & Vision', difficulty: 3, prompt: 'What will you stop doing so you can focus on the next important test?' },
      { id: 'founder-pitch-39', category: 'Ask & Vision', difficulty: 4, prompt: 'What would need to be true for this business to be worth building for five years?' },
      { id: 'founder-pitch-40', category: 'Ask & Vision', difficulty: 5, prompt: 'Give a 60-second pitch that ends with one clear, evidence-based ask.' },
    ],
    pressureTest: {
      id: 'founder-pitch-pressure-test',
      category: 'Pressure Test',
      difficulty: 5,
      prompt: 'You have one minute. An investor says, “Customers can already solve this with tools they have. Why will they switch, and what evidence do you have?” Give a specific answer and one next milestone.',
    },
    quickReadGuidance: 'For founder pitches, focus on a specific customer, a costly or repeated problem, a concrete product outcome, evidence that is actually available, and a clear ask. Do not reward market-size claims without a reachable first customer group.',
    advancedRubric: {
      version: 'founder-pitch.v1',
      criteria: [
        { name: 'Customer and problem', description: 'The pitch names a reachable customer and a concrete moment of need.' },
        { name: 'Value and difference', description: 'The product outcome is clear and connected to the customer’s current alternative.' },
        { name: 'Evidence quality', description: 'The speaker separates observed evidence from assumptions or future targets.' },
        { name: 'Milestone and ask', description: 'The request is specific and tied to a useful next proof point.' },
      ],
    },
  },
] as const;

export function getSkillPack(packId: string) {
  return SKILL_PACKS.find((pack) => pack.id === packId) ?? null;
}

export function getSkillPackTopic(topicId: string) {
  for (const pack of SKILL_PACKS) {
    const topic = pack.prompts.find((item) => item.id === topicId);
    if (topic) return { ...topic, packId: pack.id };
    if (pack.pressureTest.id === topicId) return { ...pack.pressureTest, packId: pack.id };
  }
  return null;
}
