type DropScoreInput = {
  clarity: number;
  structure: number;
  specificity: number;
  concision: number;
};

export function calculateDropScore({ clarity, structure, specificity, concision }: DropScoreInput) {
  return Math.round(((clarity + structure + specificity + concision) / 4) * 100);
}
