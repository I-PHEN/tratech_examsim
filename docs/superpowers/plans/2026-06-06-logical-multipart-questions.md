# Logical Multi-part Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a multi-part question count as ONE logical question everywhere a student sees it — the practice count picker, the stored session total, and the results screen score/accuracy.

**Architecture:** Introduce one pure backend helper (`groupIntoLogical`) that collapses question rows sharing a `question_group_id` into a single logical unit represented by its lowest-`part_index` "lead" part. The session question picker selects over logical units (so "give me N questions" yields N logical questions), the stored `total_questions` becomes the logical count, and `finishSession` aggregates a group's per-part points into one mean contribution. The results screen summarizes by logical question via a second pure helper (`summarizeResults`). Per-part grading itself is unchanged — only counting and final aggregation group the parts.

**Tech Stack:** TypeScript, Express, Supabase (service-role client), React 19, Vitest (`npm run test`), `tsc --noEmit` (`npm run lint`).

---

## File Structure

- **Create** `backend/lib/logicalQuestions.ts` — pure `groupIntoLogical()` helper (no DB, no I/O). Used by the picker and the session total.
- **Create** `backend/lib/logicalQuestions.test.ts` — unit tests for `groupIntoLogical`.
- **Create** `backend/lib/logicalScore.ts` — pure `aggregateLogicalScore()` helper.
- **Create** `backend/lib/logicalScore.test.ts` — unit tests.
- **Create** `src/lib/resultsSummary.ts` — pure `summarizeResults()` helper (frontend).
- **Create** `src/lib/resultsSummary.test.ts` — unit tests.
- **Modify** `backend/services/routingService.ts` — select over logical units (count budget = logical).
- **Modify** `backend/services/sessionService.ts` — store logical `total_questions`; group-aware score in `finishSession`.
- **Modify** `src/App.tsx` — `ReviewScreen` `stats` uses `summarizeResults`.

Tests cover the three pure helpers (matching the existing test convention — see `backend/services/topicBreakdown.test.ts`). DB-coupled service wiring and the React change are verified with `npm run lint` plus a manual check, as the codebase does not unit-test Supabase-coupled services.

---

### Task 1: `groupIntoLogical` pure helper

**Files:**
- Create: `backend/lib/logicalQuestions.ts`
- Test: `backend/lib/logicalQuestions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/lib/logicalQuestions.test.ts
import { describe, it, expect } from 'vitest';
import { groupIntoLogical } from './logicalQuestions';

describe('groupIntoLogical', () => {
  it('passes standalone rows through as one unit each', () => {
    const out = groupIntoLogical([
      { id: 'a', question_group_id: null, part_index: null },
      { id: 'b', question_group_id: null, part_index: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((u) => u.lead.id)).toEqual(['a', 'b']);
    expect(out.map((u) => u.memberIds)).toEqual([['a'], ['b']]);
  });

  it('folds a group into ONE unit led by the lowest part_index', () => {
    const out = groupIntoLogical([
      { id: 'p2', question_group_id: 'g1', part_index: 1 },
      { id: 'p1', question_group_id: 'g1', part_index: 0 },
      { id: 'p3', question_group_id: 'g1', part_index: 2 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lead.id).toBe('p1');
    expect(out[0].memberIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('preserves first-seen order of logical units and mixes groups with standalones', () => {
    const out = groupIntoLogical([
      { id: 's1', question_group_id: null, part_index: null },
      { id: 'gA-b', question_group_id: 'gA', part_index: 1 },
      { id: 's2', question_group_id: null, part_index: null },
      { id: 'gA-a', question_group_id: 'gA', part_index: 0 },
    ]);
    expect(out.map((u) => u.lead.id)).toEqual(['s1', 'gA-a', 's2']);
    expect(out.find((u) => u.lead.id === 'gA-a')!.memberIds).toEqual(['gA-a', 'gA-b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- logicalQuestions`
Expected: FAIL — `Failed to resolve import "./logicalQuestions"` / `groupIntoLogical is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/lib/logicalQuestions.ts

/** Minimal shape needed to group question rows into logical questions. */
export interface GroupableRow {
  id: string;
  question_group_id: string | null;
  part_index: number | null;
}

export interface LogicalUnit<T extends GroupableRow> {
  /** Representative row: the lowest-part_index member of a group, or the row itself when standalone. */
  lead: T;
  /** All member ids in part order (a single id for a standalone). */
  memberIds: string[];
}

/**
 * Collapse a flat list of question rows into logical questions. Standalone rows
 * pass through as one unit each; rows sharing a `question_group_id` fold into ONE
 * unit whose `lead` is the lowest-`part_index` member. Output preserves the
 * first-seen order of each logical unit; a group's `memberIds` are ordered by
 * `part_index`.
 */
export function groupIntoLogical<T extends GroupableRow>(rows: T[]): LogicalUnit<T>[] {
  const units: LogicalUnit<T>[] = [];
  const groupSlot = new Map<string, number>(); // group_id -> index into `units`
  const groupMembers = new Map<string, T[]>();

  for (const row of rows) {
    const gid = row.question_group_id;
    if (!gid) {
      units.push({ lead: row, memberIds: [row.id] });
      continue;
    }
    if (!groupSlot.has(gid)) {
      groupSlot.set(gid, units.length);
      groupMembers.set(gid, [row]);
      units.push({ lead: row, memberIds: [row.id] }); // placeholder; finalized below
    } else {
      groupMembers.get(gid)!.push(row);
    }
  }

  for (const [gid, idx] of groupSlot) {
    const members = groupMembers
      .get(gid)!
      .slice()
      .sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0));
    units[idx] = { lead: members[0], memberIds: members.map((m) => m.id) };
  }

  return units;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- logicalQuestions`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/logicalQuestions.ts backend/lib/logicalQuestions.test.ts
git commit -m "feat: groupIntoLogical helper — collapse multi-part rows into logical questions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Picker selects over logical units (count budget = logical)

**Files:**
- Modify: `backend/services/routingService.ts:149-208`

Currently the picker selects `count` part-rows then expands groups, so a 3-part group eats 3 of the requested `count`. Change it to select over logical units (one lead per group), then expand each selected unit into its full sibling set.

- [ ] **Step 1: Add the import**

At the top of `backend/services/routingService.ts`, add to the existing imports:

```ts
import { groupIntoLogical } from '../lib/logicalQuestions';
```

- [ ] **Step 2: Replace the selection + group-completion block**

Replace the entire block from `let selected: PoolRow[];` (line ~149) through the end of the `const ids: string[] = [] ... }` emit loop (line ~208) with:

```ts
  // Count a multi-part group as ONE logical question for the count budget:
  // collapse the pool into logical units (group → its lead part), select over
  // those, then expand each selected unit back into its full sibling set.
  const leads = groupIntoLogical(typedPool).map((u) => u.lead);

  let selectedLeads: PoolRow[];
  if (leads.length <= count) {
    selectedLeads = shuffle(leads);
  } else if (input.mode === 'diagnostic') {
    selectedLeads = pickDiagnostic(leads, count);
  } else if (input.mode === 'practice' && input.topic_id) {
    selectedLeads = shuffle(leads).slice(0, count);
  } else {
    selectedLeads = roundRobinByTopic(leads, count);
  }

  // Expand selected logical units into ordered question ids. A group pulls ALL
  // its siblings (atomic, contiguous, ordered by part_index) — even siblings a
  // difficulty/scope filter would have excluded — via a members lookup.
  const selectedGroupIds = Array.from(
    new Set(
      selectedLeads.map((l) => l.question_group_id).filter((g): g is string => Boolean(g))
    )
  );
  const membersByGroup = new Map<string, string[]>();
  if (selectedGroupIds.length > 0) {
    const { data: members, error: mErr } = await supabase
      .from('questions')
      .select('id, question_group_id, part_index')
      .in('question_group_id', selectedGroupIds);
    if (mErr) throw mErr;
    const memberRows = (members ?? []) as Array<{
      id: string;
      question_group_id: string;
      part_index: number | null;
    }>;
    for (const g of selectedGroupIds) {
      membersByGroup.set(
        g,
        memberRows
          .filter((r) => r.question_group_id === g)
          .sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0))
          .map((r) => r.id)
      );
    }
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const lead of selectedLeads) {
    const memberIds = lead.question_group_id
      ? membersByGroup.get(lead.question_group_id) ?? [lead.id]
      : [lead.id];
    for (const memberId of memberIds) {
      if (!seen.has(memberId)) {
        seen.add(memberId);
        ids.push(memberId);
      }
    }
  }
```

(`roundRobinByTopic` and `pickDiagnostic` are unchanged — they take `PoolRow[]`, and `leads` is a `PoolRow[]`.)

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS (no errors). If the IDE shows phantom React/JSX diagnostics, ignore them — `npm run lint` is the source of truth.

- [ ] **Step 4: Manual verification (restart backend first)**

Restart the backend (no watch mode):

```powershell
$pid = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
Stop-Process -Id $pid -Force
```

Then `npm run dev` (run via Bash `run_in_background`). With a course that has at least one multi-part group, start a PRACTICE session for a small `count` (e.g. 2) and confirm the session contains 2 *logical* questions (a 3-part group appears as one numbered question, and the picked set has at most `count` logical questions).

- [ ] **Step 5: Commit**

```bash
git add backend/services/routingService.ts
git commit -m "feat: practice picker counts a multi-part group as one logical question

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Store the logical question count in `total_questions`

**Files:**
- Modify: `backend/services/sessionService.ts:88-123` (`createSession`)

- [ ] **Step 1: Add the import**

At the top of `backend/services/sessionService.ts`, add:

```ts
import { groupIntoLogical } from '../lib/logicalQuestions';
```

- [ ] **Step 2: Compute and store the logical total**

In `createSession`, immediately after the `if (pickedQuestions.length === 0) { ... }` guard and before the `supabase.from('sessions').insert(...)` call, add:

```ts
  // total_questions is the count of LOGICAL questions (a multi-part group counts
  // once), so the student-facing total matches what they picked / see.
  const logicalTotal = groupIntoLogical(
    pickedQuestions.map((q) => ({
      id: q.id,
      question_group_id: q.question_group_id ?? null,
      part_index: q.part_index ?? null,
    }))
  ).length;
```

Then change the insert's `total_questions` line from:

```ts
      total_questions: pickedQuestions.length,
```

to:

```ts
      total_questions: logicalTotal,
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Restart backend (see Task 2 Step 4). Start a practice session including a multi-part group; on the pre-start/resume banner and in history, confirm the question total counts the group once.

- [ ] **Step 5: Commit**

```bash
git add backend/services/sessionService.ts
git commit -m "feat: store logical question count in sessions.total_questions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `aggregateLogicalScore` pure helper

**Files:**
- Create: `backend/lib/logicalScore.ts`
- Test: `backend/lib/logicalScore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/lib/logicalScore.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateLogicalScore } from './logicalScore';

describe('aggregateLogicalScore', () => {
  it('sums standalone points and counts each once', () => {
    const out = aggregateLogicalScore([
      { question_id: 'a', group_id: null, points: 1 },
      { question_id: 'b', group_id: null, points: 0 },
      { question_id: 'c', group_id: null, points: 0.5 },
    ]);
    expect(out).toEqual({ score: 1.5, logicalCount: 3 });
  });

  it('averages a group into one contribution worth one question', () => {
    const out = aggregateLogicalScore([
      { question_id: 'g-a', group_id: 'g', points: 1 },
      { question_id: 'g-b', group_id: 'g', points: 0 },
      { question_id: 'g-c', group_id: 'g', points: 1 },
    ]);
    // mean(1,0,1) = 0.666... -> rounded to 0.67; one logical question
    expect(out.score).toBeCloseTo(0.67, 2);
    expect(out.logicalCount).toBe(1);
  });

  it('mixes groups and standalones', () => {
    const out = aggregateLogicalScore([
      { question_id: 's', group_id: null, points: 1 },
      { question_id: 'g-a', group_id: 'g', points: 1 },
      { question_id: 'g-b', group_id: 'g', points: 0 },
    ]);
    expect(out.score).toBe(1.5); // 1 (standalone) + 0.5 (group mean)
    expect(out.logicalCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- logicalScore`
Expected: FAIL — import cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/lib/logicalScore.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- logicalScore`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/logicalScore.ts backend/lib/logicalScore.test.ts
git commit -m "feat: aggregateLogicalScore — average multi-part group points into one contribution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Use group-aware score in `finishSession`

**Files:**
- Modify: `backend/services/sessionService.ts:355-444` (`finishSession` grading section)

- [ ] **Step 1: Add the import**

Add to the top of `backend/services/sessionService.ts` (alongside the Task 3 import):

```ts
import { aggregateLogicalScore, type AnswerPoints } from './../lib/logicalScore';
```

(Use the path style already used for other `../lib/...` imports in the file, e.g. `'../lib/logicalScore'`.)

- [ ] **Step 2: Fetch `question_group_id` in the grading metadata**

In `finishSession`, the metadata query selects question fields. Change the select string from:

```ts
      .select('id, answer_type, question_content(prompt, correct_answer, explanation)')
```

to:

```ts
      .select('id, answer_type, question_group_id, question_content(prompt, correct_answer, explanation)')
```

Update the `qMeta` value type and the row mapping to carry `question_group_id`. Change the `qMeta` declaration from:

```ts
  const qMeta = new Map<
    string,
    { answer_type: string | null; prompt: string; correct_answer: string; explanation: string | null }
  >();
```

to:

```ts
  const qMeta = new Map<
    string,
    {
      answer_type: string | null;
      question_group_id: string | null;
      prompt: string;
      correct_answer: string;
      explanation: string | null;
    }
  >();
```

In the loop that fills `qMeta`, update the row type and the `qMeta.set(...)` call. Change the `r` cast object to include `question_group_id: string | null;` and change the `qMeta.set` to:

```ts
      qMeta.set(r.id, {
        answer_type: r.answer_type,
        question_group_id: r.question_group_id,
        prompt: c?.prompt ?? '',
        correct_answer: c?.correct_answer ?? '',
        explanation: c?.explanation ?? null,
      });
```

(Add `question_group_id: string | null;` to the inline `r` type annotation in that loop.)

- [ ] **Step 3: Collect per-answer points and aggregate logically**

Replace `let scoreSum = 0;` (just before the `await parallelMap(...)` call) with:

```ts
  const perAnswer: AnswerPoints[] = [];
```

Inside the `parallelMap` callback, every branch already computes `pts`. At the very END of the callback (after all the branches that set `pts` and write the DB), replace the existing `scoreSum += pts;` line with:

```ts
    perAnswer.push({
      question_id: a.question_id,
      group_id: meta?.question_group_id ?? null,
      points: pts,
    });
```

After the `parallelMap` call returns, replace:

```ts
  const score = Math.round(scoreSum * 100) / 100;
```

with:

```ts
  const score = aggregateLogicalScore(perAnswer).score;
```

(`total_questions` is already the logical count from Task 3, so the returned `accuracy = score / session.total_questions` is consistent and never exceeds 100%.)

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Restart backend. Sit a practice session that includes a multi-part group; answer some parts correctly and some incorrectly; finish. On the results screen confirm the score and percentage treat the group as one question (e.g. a group with 1 of 2 parts correct contributes 0.5, not 1 out of 2), and the percentage never exceeds 100%.

- [ ] **Step 6: Commit**

```bash
git add backend/services/sessionService.ts
git commit -m "feat: finishSession scores a multi-part group as one averaged contribution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `summarizeResults` pure helper (frontend)

**Files:**
- Create: `src/lib/resultsSummary.ts`
- Test: `src/lib/resultsSummary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/resultsSummary.test.ts
import { describe, it, expect } from 'vitest';
import { summarizeResults } from './resultsSummary';

describe('summarizeResults', () => {
  it('counts standalone items individually', () => {
    const out = summarizeResults([
      { groupId: null, isCorrect: true, isUnanswered: false },
      { groupId: null, isCorrect: false, isUnanswered: false },
      { groupId: null, isCorrect: null, isUnanswered: true },
    ]);
    expect(out).toEqual({ total: 3, correct: 1, incorrect: 1, unanswered: 1 });
  });

  it('collapses a group into one question (all parts correct => correct)', () => {
    const out = summarizeResults([
      { groupId: 'g', isCorrect: true, isUnanswered: false },
      { groupId: 'g', isCorrect: true, isUnanswered: false },
    ]);
    expect(out).toEqual({ total: 1, correct: 1, incorrect: 0, unanswered: 0 });
  });

  it('a group with any wrong part counts as one incorrect', () => {
    const out = summarizeResults([
      { groupId: 'g', isCorrect: true, isUnanswered: false },
      { groupId: 'g', isCorrect: false, isUnanswered: false },
    ]);
    expect(out).toEqual({ total: 1, correct: 0, incorrect: 1, unanswered: 0 });
  });

  it('a group is unanswered only when every part is unanswered', () => {
    const out = summarizeResults([
      { groupId: 'g', isCorrect: null, isUnanswered: true },
      { groupId: 'g', isCorrect: null, isUnanswered: true },
    ]);
    expect(out).toEqual({ total: 1, correct: 0, incorrect: 0, unanswered: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- resultsSummary`
Expected: FAIL — import cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/resultsSummary.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- resultsSummary`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resultsSummary.ts src/lib/resultsSummary.test.ts
git commit -m "feat: summarizeResults — group-aware results summary helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Wire `summarizeResults` into the results screen stats

**Files:**
- Modify: `src/App.tsx:2032-2053` (`ReviewScreen` `stats` useMemo)

- [ ] **Step 1: Add the import**

Add near the other `src/lib/...` imports at the top of `src/App.tsx`:

```ts
import { summarizeResults } from './lib/resultsSummary';
```

- [ ] **Step 2: Replace the `stats` computation**

Replace the entire `const stats = useMemo(() => { ... }, [items, data]);` block (lines ~2032-2053) with:

```ts
  const stats = useMemo(() => {
    const summary = summarizeResults(
      items.map((it) => ({
        groupId: it.groupId,
        isCorrect: it.isCorrect,
        isUnanswered: it.isUnanswered,
      }))
    );
    const total = summary.total;
    // The authoritative score is the finished session's (group-aware, fractional,
    // with partial credit); fall back to the count of correct logical questions.
    const rawScore = data?.session.score ?? summary.correct;
    return {
      correct: summary.correct,
      incorrect: summary.incorrect,
      unanswered: summary.unanswered,
      total,
      score: Math.round(rawScore * 10) / 10,
      percent: total > 0 ? Math.round((rawScore / total) * 100) : 0,
    };
  }, [items, data]);
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS. (`it.groupId`, `it.isCorrect`, `it.isUnanswered` already exist on the `ReviewItem` shape built at `src/App.tsx:2000-2028`.)

- [ ] **Step 4: Manual verification**

Frontend hot-reloads (no restart needed). Open a finished session review that includes a multi-part group. Confirm:
- the `score / total` header counts the group once (total = logical questions),
- the Correct / Incorrect / Unanswered pills sum to the logical total,
- the percentage matches the backend accuracy and never exceeds 100%.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: results screen summarizes score and counts by logical question

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (§2 of the design doc):**
- "Count picker — a group consumes 1 slot of `count`" → Task 2. ✓
- "Stored total — `total_questions` = logical count" → Task 3. ✓
- "Group-aware scoring — each group contributes the average of its parts' points" → Tasks 4–5. ✓
- "Results screen — `stats` counts logical questions" → Tasks 6–7. ✓
- "Per-part grading logic itself is unchanged" → Tasks 4–5 only aggregate stored per-answer `points`; the per-type grading branches are untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output. ✓

**Type consistency:** `groupIntoLogical`/`LogicalUnit`/`GroupableRow` (Task 1) are reused unchanged in Tasks 2–3. `AnswerPoints`/`aggregateLogicalScore` (Task 4) match their use in Task 5. `ResultItem`/`summarizeResults` (Task 6) match the `items.map(...)` shape in Task 7 (`groupId`, `isCorrect`, `isUnanswered`). ✓

**Note on the rendered review rows:** parts continue to render as individual rows under their shared display number (e.g. "3a / 3b") — only the summary *counts/score* are group-aware. Collapsing the rendered rows into a single combined card is intentionally out of scope (it adds rendering risk for no correctness gain); the shared numbering already reads as one question.
