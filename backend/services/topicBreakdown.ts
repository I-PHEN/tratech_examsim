export interface TopicBreakdownEntry {
  topic_id: string;
  topic_name: string | null;
  correct: number;
  total: number;
  accuracy: number; // 0..1
}

interface AnswerRow {
  topic_id: string;
  topic_name: string | null;
  is_correct: boolean | null;
}

/** Per-topic correctness for a single session, sorted weakest-first. */
export function summarizeByTopic(rows: AnswerRow[]): TopicBreakdownEntry[] {
  const buckets = new Map<string, { topic_name: string | null; correct: number; total: number }>();
  for (const r of rows) {
    const b = buckets.get(r.topic_id) ?? { topic_name: r.topic_name, correct: 0, total: 0 };
    b.total += 1;
    if (r.is_correct === true) b.correct += 1;
    buckets.set(r.topic_id, b);
  }
  return Array.from(buckets.entries())
    .map(([topic_id, b]) => ({
      topic_id,
      topic_name: b.topic_name,
      correct: b.correct,
      total: b.total,
      accuracy: b.total > 0 ? b.correct / b.total : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}
