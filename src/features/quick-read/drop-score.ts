import { calculateRubricDropScore } from '../../../supabase/functions/_shared/dropmic-rubric';

type DropScoreInput = {
  clarity: number;
  structure: number;
  specificity: number;
  concision: number;
  rubricScores?: Record<string, number>;
  taskMet?: boolean;
};

const CRITERION_IDS = [
  'main_message', 'task_alignment', 'understandable_meaning', 'internal_consistency',
  'orientation', 'progression', 'connections', 'completion',
  'concrete_detail', 'support', 'explanation', 'sufficient_development',
  'relevant_content', 'repetition', 'economy_of_wording', 'focus',
] as const;

export function calculateDropScore({ clarity, structure, specificity, concision, rubricScores, taskMet }: DropScoreInput): number | null {
  if (taskMet === false) return null;
  if (rubricScores && CRITERION_IDS.every((id) => Number.isInteger(rubricScores[id]) && rubricScores[id] >= 0 && rubricScores[id] <= 2)) {
    return calculateRubricDropScore(rubricScores as Parameters<typeof calculateRubricDropScore>[0]);
  }
  return Math.round(((clarity + structure + specificity + concision) / 4) * 100);
}
