import { completion } from '../../lib/llm';

export interface AnswerMatch {
  question_index: number;
  found: boolean;
  /** Final answer — maps to `correct_answer` for calc questions. NUMERIC value
   *  only (no unit text); units go in `final_unit`. */
  final_answer?: string;
  /** Unit string on its own — maps to `unit` on calc questions. */
  final_unit?: string;
  /** Step-by-step worked solution — maps to `explanation`. Markdown + LaTeX. */
  worked_solution?: string;
  /** Verbatim text of the correct option — best-effort MCQ matching. */
  correct_option?: string;
}

interface MatchQuestion {
  prompt: string;
  type: 'mcq' | 'calc';
}

const CHUNK_SIZE = 15;

const SYSTEM_PROMPT = `You match exam questions to their answers in a marking scheme / answer key.

You receive the full text of a marking scheme and a numbered list of questions.
For EACH question, locate its answer in the marking scheme and return:
  - "final_answer": for a numeric calculation, the NUMERIC VALUE ONLY — no
    unit text (e.g. "12.4", not "12.4 dm^3"). For an MCQ, the correct option's
    text. For a question answered in words, a one- or two-sentence statement.
  - "final_unit": the unit on its own (e.g. "dm^3", "mol/L", "%"). Empty when
    the answer is dimensionless, for MCQ questions, or when the answer is a
    written sentence.
  - "worked_solution": the COMPLETE step-by-step solution for this question,
    copied VERBATIM from the marking scheme — every sentence, every
    intermediate result, every aside, every line of working. DO NOT paraphrase,
    abbreviate, condense, or skip prose between math steps. If the markscheme
    has a sentence explaining WHY a step is taken, that sentence MUST appear
    in your output. End with the final answer stated as a clear sentence
    (e.g. "Therefore, the rate constant k = 0.046 min^-1."). Do NOT invent
    steps the scheme does not show.
  - "correct_option": for an MCQ only, the verbatim text of the correct option.
  - "found": true only if the marking scheme actually contains this answer.

FORMATTING — "final_answer", "final_unit" and "worked_solution" MUST be valid
Markdown + LaTeX (rendered with KaTeX): inline math in $...$, display math in
$$...$$, chemistry with proper sub/superscripts, Markdown lists for the steps.
Format only — never change numbers, wording or meaning.

If a question's answer is not in the marking scheme, return "found": false and
omit the other fields. NEVER guess.

Return ONLY a JSON object, no markdown fences, no commentary:
{ "matches": [ { "question_index": <int>, "found": <bool>, "final_answer": "...", "final_unit": "...", "worked_solution": "...", "correct_option": "..." } ] }`;

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

async function matchChunk(
  questions: Array<{ index: number; prompt: string; type: 'mcq' | 'calc' }>,
  markschemeText: string,
  model?: string
): Promise<AnswerMatch[]> {
  const questionList = questions
    .map((q) => `  [${q.index}] (${q.type}) ${q.prompt.slice(0, 4000)}`)
    .join('\n\n');

  const result = await completion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `MARKING SCHEME:\n${markschemeText}\n\nQUESTIONS:\n${questionList}`,
      },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  let parsed: { matches?: AnswerMatch[] };
  try {
    parsed = JSON.parse(stripFences(result.content));
  } catch {
    return [];
  }
  return Array.isArray(parsed.matches) ? parsed.matches : [];
}

/**
 * Match each question to its answer in an uploaded marking scheme. Questions
 * are chunked so the markscheme text fits the model's context per call.
 */
export async function matchAnswers(
  questions: MatchQuestion[],
  markschemeText: string,
  model?: string
): Promise<AnswerMatch[]> {
  if (questions.length === 0 || !markschemeText.trim()) return [];

  const indexed = questions.map((q, i) => ({ index: i, prompt: q.prompt, type: q.type }));
  const results: AnswerMatch[] = [];

  for (let i = 0; i < indexed.length; i += CHUNK_SIZE) {
    const chunk = indexed.slice(i, i + CHUNK_SIZE);
    const matches = await matchChunk(chunk, markschemeText, model);
    results.push(...matches);
  }

  return results;
}
