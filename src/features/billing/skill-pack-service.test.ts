import { describe, expect, it } from '@jest/globals';

import { getSkillPack } from '../../../supabase/functions/_shared/skill-pack-content';
import { parseSkillPackContent } from './skill-pack-service';
import { SKILL_PACKS } from '@/features/topics/skill-packs';

describe('launch Skill Pack contract', () => {
  it('ships two separate $4.99 non-consumable Pack identifiers', () => {
    expect(SKILL_PACKS.map(({ id, productId, entitlementKey }) => [id, productId, entitlementKey])).toEqual([
      ['interview_pro', 'dropmic_pack_interview_pro', 'pack.interview_pro'],
      ['founder_pitch', 'dropmic_pack_founder_pitch', 'pack.founder_pitch'],
    ]);
    expect(SKILL_PACKS.every((pack) => pack.priceFallback === '$4.99')).toBe(true);
  });

  it('validates the full curated Pack content contract before using server content', () => {
    for (const summary of SKILL_PACKS) {
      const pack = getSkillPack(summary.id);
      expect(pack).not.toBeNull();
      expect(pack?.prompts).toHaveLength(40);
      expect(new Set(pack?.prompts.map((prompt) => prompt.category)).size).toBeGreaterThanOrEqual(5);
      expect(new Set(pack?.prompts.map((prompt) => prompt.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]));
      expect(pack?.prompts.filter((prompt) => prompt.challengeReady)).toHaveLength(3);
      expect(pack?.drills).toHaveLength(5);
      expect(pack?.terminology.length).toBeGreaterThanOrEqual(5);
      expect(pack?.pressureTest.category).toBe('Pressure Test');
      expect(pack?.advancedRubric.version).toContain('.v1');
      expect(parseSkillPackContent(pack, summary.id)).toMatchObject({ id: summary.id });
    }
  });

  it('fails closed on incomplete, mismatched, duplicate, and malformed Pack content', () => {
    const pack = getSkillPack('interview_pro');
    expect(parseSkillPackContent(null, 'interview_pro')).toBeNull();
    expect(parseSkillPackContent(pack, 'founder_pitch')).toBeNull();
    expect(parseSkillPackContent({ ...pack, prompts: pack?.prompts.slice(0, 39) }, 'interview_pro')).toBeNull();
    expect(parseSkillPackContent({ ...pack, prompts: [...(pack?.prompts ?? []), pack?.prompts[0]] }, 'interview_pro')).toBeNull();
    expect(parseSkillPackContent({ ...pack, pressureTest: { ...pack?.pressureTest, category: 'Behavioral' } }, 'interview_pro')).toBeNull();
  });
});
