import { randomUUID } from 'crypto';
import { completion } from '../../lib/llm';
import { parallelMap } from '../../lib/concurrency';
import type { DraftDataInput } from '../../schemas/ingestion';

/** One sub-part produced by splitting a multi-part question. */
export interface SplitPart {
  part_label: string;
  type: 'mcq' | 'calc';
  prompt: string;
  options?: Array<{ text: string; is_correct: boolean }>;
  answer_type?: 'exact' | 'range' | 'written';
  correct_answer?: string;
  answer_tolerance?: number;
  unit?: string;
  explanation?: string;
}

export interface SplitResult {
  parts: SplitPart[];
}

const MAX_SOLUTION_CHARS = 12000;
const SPLIT_CONCURRENCY_PAID = 3;
const SPLIT_CONCURRENCY_FREE = 1;

const SYSTEM_PROMPT = `You split ONE exam question that has multiple sub-parts into one standalone record per sub-part.

You receive:
  - QUESTION: the full text of a single exam question — a shared setup / given data followed by sub-parts (a), (b), (c), (i), (ii)...
  - SOLUTION (optional): the worked solution or marking scheme for that question.

For EACH sub-part, return one record:
  - "part_label": the sub-part label exactly as in the source ("a", "b", "ii", ...).
  - "type": "mcq" if the sub-part offers answer options, otherwise "calc".
  - "prompt": the COMPLETE standalone question for this sub-part — the shared setup / given data, then this sub-part's specific task, copied verbatim. A student MUST be able to solve it with NO access to the other parts.
  - "options": for an mcq sub-part only — the answer options [{ "text": "...", "is_correct": true|false }].
  - "answer_type": "exact" | "range" | "written". Use "written" when the expected answer is a worded statement / explanation / interpretation rather than a single value.
  - "correct_answer": for a calc sub-part — its final answer (value with unit, or the worded model answer when "written"). Take it ONLY from the SOLUTION. Omit it when the SOLUTION does not give this sub-part's answer.
  - "answer_tolerance": a number, for "range" answers only.
  - "unit": the unit of a numeric answer, if any.
  - "explanation": the COMPLETE step-by-step worked solution for THIS sub-part, copied faithfully from the SOLUTION — every step and all reasoning, ending with the final answer stated as a clear sentence. Take it ONLY from the SOLUTION.

CRITICAL — distribute, never duplicate:
  - Each part gets ONLY its own answer and ONLY its own worked-solution slice.
  - NEVER put part (b)'s answer or solution onto part (a).
  - When the SOLUTION has no content for a sub-part, leave "correct_answer" and "explanation" empty for that part. NEVER guess.

FORMATTING: "prompt", "options[].text", "correct_answer" and "explanation" MUST be valid Markdown + LaTeX (rendered with KaTeX) — inline math in $...$, display math in $$...$$, chemistry with proper sub/superscripts. Format only — never change numbers, wording or meaning.

Return ONLY a JSON object, no markdown fences, no commentary:
{ "parts": [ { "part_label": "...", "type": "...", "prompt": "...", "answer_type": "...", "correct_answer": "...", "explanation": "..." } ] }`;

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function splitConcurrencyFor(model?: string): number {
  const effective = model ?? process.env.GROQ_DEFAULT_MODEL ?? '';
  return effective.endsWith(':free') ? SPLIT_CONCURRENCY_FREE : SPLIT_CONCURRENCY_PAID;
}

/**
 * Split ONE multi-part question into its sub-parts with one focused LLM call.
 * Seeing the whole question and its whole solution together is what lets each
 * part get its OWN answer and OWN worked-solution slice. Returns `{ parts: [] }`
 * when the model returns nothing usable — the caller decides what to do.
 */
export async function splitMultipartQuestion(
  fullPrompt: string,
  solutionSource?: string,
  model?: string
): Promise<SplitResult> {
  if (!fullPrompt.trim()) return { parts: [] };

  const solutionBlock = solutionSource?.trim()
    ? `\n\nSOLUTION:\n${solutionSource.trim().slice(0, MAX_SOLUTION_CHARS)}`
    : '\n\nSOLUTION: (none provided — leave correct_answer and explanation empty)';

  const result = await completion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `QUESTION:\n${fullPrompt}${solutionBlock}` },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  let parsed: { parts?: SplitPart[] };
  try {
    parsed = JSON.parse(stripFences(result.content));
  } catch {
    return { parts: [] };
  }
  if (!Array.isArray(parsed.parts)) return { parts: [] };

  const parts = parsed.parts.filter(
    (p) => p && typeof p.prompt === 'string' && p.prompt.trim().length > 0
  );
  return { parts };
}

/**
 * Build one draft row per split part — a shared `group_key`, ordered
 * `part_index`, inherited metadata, and `raw_text` set to the original whole
 * question so a later merge can restore it exactly. Reused by both the
 * pipeline auto-split and the manual split endpoint.
 */
export function partsToRows<T extends { draft_data: DraftDataInput }>(
  row: T,
  parts: SplitPart[]
): T[] {
  const d = row.draft_data;
  const groupKey = randomUUID();

  return parts.map((p, i) => {
    const draft_data: DraftDataInput = {
      type: p.type === 'mcq' ? 'mcq' : 'calc',
      prompt: p.prompt,
      group_key: groupKey,
      part_label: p.part_label?.trim() || String.fromCharCode(97 + i),
      part_index: i,
      raw_text: d.prompt, // the original whole question — for an exact merge round-trip
    };

    // Inherit shared metadata from the parent draft.
    if (d.difficulty) draft_data.difficulty = d.difficulty;
    if (d.topic_id) draft_data.topic_id = d.topic_id;
    if (d.exam_scope) draft_data.exam_scope = d.exam_scope;
    if (d.source_reference) draft_data.source_reference = d.source_reference;

    if (draft_data.type === 'mcq') {
      if (Array.isArray(p.options) && p.options.length >= 2) draft_data.options = p.options;
    } else {
      draft_data.answer_type = p.answer_type ?? 'exact';
      if (p.correct_answer?.trim()) draft_data.correct_answer = p.correct_answer.trim();
      if (typeof p.answer_tolerance === 'number') draft_data.answer_tolerance = p.answer_tolerance;
      if (p.unit?.trim()) draft_data.unit = p.unit.trim();
    }
    if (p.explanation?.trim()) draft_data.explanation = p.explanation.trim();

    // Flag AI-filled answer / solution so the reviewer verifies them.
    const aiMatched: { correct_answer?: boolean; explanation?: boolean } = {};
    if (draft_data.correct_answer) aiMatched.correct_answer = true;
    if (draft_data.explanation) aiMatched.explanation = true;
    if (Object.keys(aiMatched).length > 0) draft_data.ai_matched = aiMatched;

    return { ...row, draft_data } as T;
  });
}

export interface ExpandOpts {
  markschemeText?: string;
  model?: string;
}

/**
 * Expand every draft row flagged multi-part (`draft_data.part_labels` of length
 * >= 2) into one row per sub-part, with answers / worked solutions distributed
 * by `splitMultipartQuestion`. A row that fails to split is kept unchanged (its
 * `part_labels` stays, so the review UI can still offer a manual split).
 * Non-fatal: a single split failure never drops the question.
 */
export async function expandMultipartRows<T extends { draft_data: DraftDataInput }>(
  rows: T[],
  opts: ExpandOpts
): Promise<T[]> {
  const expanded = await parallelMap(rows, splitConcurrencyFor(opts.model), async (row) => {
    const d = row.draft_data;
    if (!d.part_labels || d.part_labels.length < 2) return [row];

    const solutionSource = opts.markschemeText?.trim() || d.explanation;
    let parts: SplitPart[];
    try {
      ({ parts } = await splitMultipartQuestion(d.prompt, solutionSource, opts.model));
    } catch {
      return [row];
    }
    if (parts.length < 2) return [row];

    return partsToRows(row, parts);
  });
  return expanded.flat();
}
