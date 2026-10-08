export type SkillPackId = 'interview_pro' | 'founder_pitch';

export type SkillPackSummary = {
  id: SkillPackId;
  entitlementKey: `pack.${SkillPackId}`;
  productId: `dropmic_pack_${SkillPackId}`;
  packageId: `pack_${SkillPackId}`;
  title: string;
  tagline: string;
  description: string;
  categories: readonly string[];
  priceFallback: '$4.99';
};

export type SkillPackPracticeContent = {
  id: SkillPackId;
  prompts: readonly {
    id: string;
    prompt: string;
    category: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    challengeReady?: boolean;
  }[];
  drills: readonly { id: string; title: string; instruction: string; topicId: string }[];
  terminology: readonly { term: string; meaning: string }[];
  pressureTest: {
    id: string;
    prompt: string;
    category: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
  };
  quickReadGuidance: string;
  advancedRubric?: { version: string; criteria: readonly { name: string; description: string }[] } | null;
};

export const SKILL_PACKS: readonly SkillPackSummary[] = [
  {
    id: 'interview_pro',
    entitlementKey: 'pack.interview_pro',
    productId: 'dropmic_pack_interview_pro',
    packageId: 'pack_interview_pro',
    title: 'Interview Pro',
    tagline: 'Build answers that are clear, specific, and easy to remember.',
    description: 'A practical interview workout: 40 prompts, five focused drills, five levels of difficulty, and a final pressure test.',
    categories: ['Behavioral', 'Leadership', 'Collaboration', 'Problem Solving', 'Career Growth'],
    priceFallback: '$4.99',
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
    priceFallback: '$4.99',
  },
] as const;

export function getSkillPackSummary(packId: string) {
  return SKILL_PACKS.find((pack) => pack.id === packId) ?? null;
}
