// @ts-ignore Deno requires explicit extensions for local function imports.
import { DROPMIC_RUBRIC_VERSION } from './quick-read-versions.ts';

export { DROPMIC_RUBRIC_VERSION };

export const RUBRIC_DIMENSIONS = {
  clarity: ['main_message', 'task_alignment', 'understandable_meaning', 'internal_consistency'],
  structure: ['orientation', 'progression', 'connections', 'completion'],
  specificity: ['concrete_detail', 'support', 'explanation', 'sufficient_development'],
  concision: ['relevant_content', 'repetition', 'economy_of_wording', 'focus'],
} as const;

export type RubricDimension = keyof typeof RUBRIC_DIMENSIONS;
export type RubricCriterionId = (typeof RUBRIC_DIMENSIONS)[RubricDimension][number];
export type RubricScore = 0 | 1 | 2;
export type RubricScoreMap = Record<RubricCriterionId, RubricScore>;
export type RubricDimensionScores = Record<RubricDimension, number>;

export type RubricJudgment = {
  score: RubricScore;
  evidence: string;
  rationale: string;
  reasonCode: string;
};

export type RubricAssessment = Record<RubricCriterionId, RubricJudgment>;

export const RUBRIC_ANCHORS: Record<RubricCriterionId, { name: string; zero: string; one: string; two: string; reasons: readonly string[] }> = {
  main_message: { name: 'Main message', zero: 'No identifiable central message.', one: 'The message can be inferred, but competing ideas obscure it.', two: 'The central message is identifiable without guessing.', reasons: ['no_clear_message', 'competing_ideas', 'none'] },
  task_alignment: { name: 'Task alignment', zero: 'Does not address the requested task.', one: 'Addresses part of it or drifts substantially.', two: 'Directly addresses the task throughout the substantive response.', reasons: ['task_mismatch', 'partial_or_drifting', 'none'] },
  understandable_meaning: { name: 'Understandable meaning', zero: 'Key statements cannot be interpreted from context.', one: 'Some unclear wording requires reconstruction.', two: 'Key statements communicate understandable meaning.', reasons: ['meaning_unintelligible', 'meaning_ambiguous', 'none'] },
  internal_consistency: { name: 'Internal consistency', zero: 'An unresolved contradiction undermines the message.', one: 'An apparent tension or ambiguity weakens the message.', two: 'Claims fit together, or changes in position are explained.', reasons: ['contradiction_unresolved', 'tension_unresolved', 'none'] },
  orientation: { name: 'Orientation', zero: 'The listener lacks context needed to follow.', one: 'Context arrives late or remains incomplete.', two: 'The opening gives enough direction or context.', reasons: ['context_missing', 'context_late', 'none'] },
  progression: { name: 'Progression', zero: 'Ideas are disconnected.', one: 'The order is followable but contains an unexplained jump.', two: 'Ideas develop in a logical or purposeful sequence.', reasons: ['ideas_disconnected', 'sequence_jump', 'none'] },
  connections: { name: 'Connections', zero: 'Necessary relationships between ideas are missing.', one: 'Some relationships must be inferred.', two: 'Reasons, examples, contrasts, or events connect clearly.', reasons: ['relationship_missing', 'relationship_implicit', 'none'] },
  completion: { name: 'Completion', zero: 'Stops before resolving the central thought.', one: 'The main thought is answered, but the ending is loose.', two: 'Ends with an answer, outcome, takeaway, or intentional resolution.', reasons: ['thought_unresolved', 'ending_loose', 'none'] },
  concrete_detail: { name: 'Concrete detail', zero: 'Remains entirely general.', one: 'Includes a detail that adds limited understanding.', two: 'Includes a relevant example, observation, action, scenario, or precise explanation.', reasons: ['detail_general', 'detail_limited', 'none'] },
  support: { name: 'Support', zero: 'The central claim or message lacks needed support.', one: 'Support is relevant but weak or incomplete.', two: 'Support meaningfully develops the central message.', reasons: ['support_missing', 'support_incomplete', 'none'] },
  explanation: { name: 'Explanation', zero: 'Gives support without explaining its significance.', one: 'The connection to the message is partly explained.', two: 'Makes clear how or why the support matters.', reasons: ['significance_unexplained', 'significance_partial', 'none'] },
  sufficient_development: { name: 'Sufficient development', zero: 'Too little development to understand the message.', one: 'Understandable, with an important explanatory gap.', two: 'Enough development for this task and duration.', reasons: ['development_insufficient', 'development_gap', 'none'] },
  relevant_content: { name: 'Relevant content', zero: 'Substantial content does not serve the message.', one: 'Contains a removable detour.', two: 'Substantive content serves the message.', reasons: ['content_off_topic', 'detour', 'none'] },
  repetition: { name: 'Repetition', zero: 'Repeats ideas without adding meaning.', one: 'Some avoidable restatement.', two: 'Repetition adds purpose or is absent.', reasons: ['repetition_unhelpful', 'restatement_avoidable', 'none'] },
  economy_of_wording: { name: 'Economy of wording', zero: 'Unnecessary phrasing obscures the message.', one: 'Some phrases could be shortened without losing meaning.', two: 'Wording carries meaning efficiently.', reasons: ['wording_obscures', 'wording_redundant', 'none'] },
  focus: { name: 'Focus', zero: 'Unfinished side threads overwhelm the message.', one: 'A side thread distracts from the message.', two: 'Maintains a manageable scope and resolves necessary threads.', reasons: ['side_threads_overwhelm', 'side_thread_distracts', 'none'] },
};

export const RUBRIC_CRITERION_IDS = Object.values(RUBRIC_DIMENSIONS).flat() as RubricCriterionId[];

export function calculateRubricDropScore(scores: RubricScoreMap) {
  const totalPoints = RUBRIC_CRITERION_IDS.reduce((sum, id) => sum + scores[id], 0);
  return Math.round((totalPoints / 32) * 100);
}

export function calculateRubricDimensionScores(scores: RubricScoreMap): RubricDimensionScores {
  return Object.fromEntries(Object.entries(RUBRIC_DIMENSIONS).map(([dimension, ids]) => [
    dimension,
    ids.reduce((sum, id) => sum + scores[id as RubricCriterionId], 0) / 8,
  ])) as RubricDimensionScores;
}

export const RUBRIC_DRILLS: Record<RubricCriterionId, string> = {
  main_message: 'Take Two: state your main point in the first sentence, then support it for exactly 60 seconds.',
  task_alignment: 'Take Two: answer the prompt directly in your first sentence, then support that answer for exactly 60 seconds.',
  understandable_meaning: 'Take Two: explain one idea with plain, complete sentences for exactly 60 seconds.',
  internal_consistency: 'Take Two: state one position and explain how each reason fits it for exactly 60 seconds.',
  orientation: 'Take Two: open with the context a listener needs, then develop your point for exactly 60 seconds.',
  progression: 'Take Two: explain one idea, then build to its result in a clear order for exactly 60 seconds.',
  connections: 'Take Two: connect each reason or example to your main point for exactly 60 seconds.',
  completion: 'Take Two: finish by resolving your main thought in one clear closing sentence within 60 seconds.',
  concrete_detail: 'Take Two: include one relevant real example or observation and develop it for exactly 60 seconds.',
  support: 'Take Two: support your main claim with one relevant reason or example for exactly 60 seconds.',
  explanation: 'Take Two: after your example, explain how it supports your point for exactly 60 seconds.',
  sufficient_development: 'Take Two: develop one point with a reason and explanation for exactly 60 seconds.',
  relevant_content: 'Take Two: keep each sentence connected to your main point for exactly 60 seconds.',
  repetition: 'Take Two: remove one repeated idea and use that time to develop a new reason for exactly 60 seconds.',
  economy_of_wording: 'Take Two: express your point in direct phrases and develop it for exactly 60 seconds.',
  focus: 'Take Two: choose one main thread and resolve it within exactly 60 seconds.',
};

export type TaskMode = 'cold_take' | 'freestyle' | 'interview_basics' | 'student_basics' | 'challenge_response' | 'unknown';
export type DurationProfile = 30 | 60 | 90 | 'unknown';

export function describeTaskProfile(mode: TaskMode, duration: DurationProfile) {
  const modeDescription: Record<TaskMode, string> = {
    cold_take: 'Cold Take: assess a direct response to a supplied speaking prompt; a clear position, relevant reasoning, and one useful illustration can fully develop one idea.',
    freestyle: 'Freestyle: assess the purpose the speaker establishes for themself; do not invent an external task or require a formula.',
    interview_basics: 'Interview Basics: assess whether the answer responds to the interview question with relevant context, the speaker’s action or reasoning, and an outcome or learning when the question calls for it.',
    student_basics: 'Student Basics: assess whether the explanation or answer fits the learning prompt, develops its key idea, and makes reasoning understandable; do not grade subject-matter correctness.',
    challenge_response: 'Challenge response: assess a direct response to the creator’s prompt using the same message-effectiveness criteria as every other mode.',
    unknown: 'General Drop: assess the task context stored with the attempt; do not infer a task from speaking style.',
  };
  const durationDescription = duration === 30
    ? '30 seconds: one developed idea can earn full credit.'
    : duration === 60
      ? '60 seconds: develop enough explanation for the task without padding.'
      : duration === 90
        ? '90 seconds: sustain development without unnecessary expansion.'
        : 'Duration unknown: do not infer a duration expectation.';
  return `${modeDescription[mode]} ${durationDescription}`;
}

const COACHING_PRIORITY: readonly RubricCriterionId[] = [
  'task_alignment', 'main_message', 'understandable_meaning', 'connections', 'support', 'explanation', 'completion',
  'progression', 'orientation', 'concrete_detail', 'sufficient_development', 'internal_consistency', 'relevant_content',
  'focus', 'repetition', 'economy_of_wording',
];

export function summarizeRubric(assessment: RubricAssessment) {
  const scores = Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, assessment[id].score])) as RubricScoreMap;
  const dimensionScores = calculateRubricDimensionScores(scores);
  const totalPoints = RUBRIC_CRITERION_IDS.reduce((sum, id) => sum + scores[id], 0);
  const selectedFix = scores.task_alignment === 0
    ? 'task_alignment'
    : scores.main_message === 0
      ? 'main_message'
      : [...COACHING_PRIORITY].sort((a, b) => scores[a] - scores[b] || COACHING_PRIORITY.indexOf(a) - COACHING_PRIORITY.indexOf(b))[0];
  const hasWeakness = scores[selectedFix] < 2;
  const strength = [...RUBRIC_CRITERION_IDS]
    .sort((a, b) => scores[b] - scores[a] || RUBRIC_CRITERION_IDS.indexOf(a) - RUBRIC_CRITERION_IDS.indexOf(b))[0];
  return {
    rubricVersion: DROPMIC_RUBRIC_VERSION,
    rubricScores: scores,
    dimensionScores,
    totalPoints,
    dropScore: calculateRubricDropScore(scores),
    taskMet: scores.task_alignment > 0,
    scoreAvailable: scores.task_alignment > 0,
    strengthCriterion: strength,
    fixCriterion: hasWeakness ? selectedFix : null,
    strength: assessment[strength].rationale,
    improvement: hasWeakness ? assessment[selectedFix].rationale : 'You met the core communication anchors; now try a useful counterpoint without losing your main thread.',
    nextDrill: hasWeakness ? RUBRIC_DRILLS[selectedFix] : 'Take Two: add one useful counterpoint, connect it to your main point, and finish within exactly 60 seconds.',
  };
}
