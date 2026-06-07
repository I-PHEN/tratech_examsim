export interface AnswerPoints {
  question_id: string;
  group_id: string | null;
  points: number; // 0..1
}

export interface LogicalScore {
  score: number; // sum of logical contributions (each 0..1), rounded to 2dp
  logicalCount: number; // number of logical questions represented by these answers
}

/**
 * Aggregate per-answer points into a logical-question score: a standalone answer
 * contributes its points; a multi-part group contributes the MEAN of its
 * members' points (so a group is worth one question, not one per part).
 */
export function aggregateLogicalScore(answers: AnswerPoints[]): LogicalScore {
  const groups = new Map<string, number[]>();
  let score = 0;
  let logicalCount = 0;

  for (const a of answers) {
    if (!a.group_id) {
      score += a.points;
      logicalCount += 1;
    } else {
      const bucket = groups.get(a.group_id);
      if (bucket) bucket.push(a.points);
      else groups.set(a.group_id, [a.points]);
    }
  }

  for (const [, pts] of groups) {
    score += pts.reduce((s, p) => s + p, 0) / pts.length;
    logicalCount += 1;
  }

  return { score: Math.round(score * 100) / 100, logicalCount };
}
