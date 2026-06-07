export interface ResultItem {
  groupId: string | null;
  isCorrect: boolean | null; // null when unanswered or not yet graded
  isUnanswered: boolean;
}

export interface ResultSummary {
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
}

/**
 * Summarize review items by LOGICAL question: standalone items count once, and a
 * multi-part group counts once. A group is `unanswered` only if every part is
 * unanswered, `correct` only if every part is correct, otherwise `incorrect`.
 * Order is irrelevant to the counts; grouping is by `groupId`.
 */
export function summarizeResults(items: ResultItem[]): ResultSummary {
  const groups = new Map<string, ResultItem[]>();
  const order: Array<{ kind: 'single'; item: ResultItem } | { kind: 'group'; id: string }> = [];

  for (const it of items) {
    if (!it.groupId) {
      order.push({ kind: 'single', item: it });
    } else if (groups.has(it.groupId)) {
      groups.get(it.groupId)!.push(it);
    } else {
      groups.set(it.groupId, [it]);
      order.push({ kind: 'group', id: it.groupId });
    }
  }

  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;

  const classify = (parts: ResultItem[]): 'correct' | 'incorrect' | 'unanswered' => {
    if (parts.every((p) => p.isUnanswered)) return 'unanswered';
    if (parts.every((p) => p.isCorrect === true)) return 'correct';
    return 'incorrect';
  };

  for (const entry of order) {
    const parts = entry.kind === 'single' ? [entry.item] : groups.get(entry.id)!;
    const c = classify(parts);
    if (c === 'correct') correct++;
    else if (c === 'unanswered') unanswered++;
    else incorrect++;
  }

  return { total: order.length, correct, incorrect, unanswered };
}
