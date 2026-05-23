import { completion } from '../lib/llm';

export interface WrittenGrade {
  /** 0.0 – 1.0 */
  points: number;
  feedback: string;
}

const SYSTEM_PROMPT = `You are a fair, rigorous marker for a written exam answer.

You receive a question, the model answer, the full worked solution, and a
student's answer. Mark the student's answer against the model answer.

Return a "points" score from 0.0 to 1.0:
  - 1.0  fully correct — all key ideas present and correct.
  - partial (e.g. 0.5) — some key ideas correct, others missing or wrong.
  - 0.0  incorrect, irrelevant, or blank.
Award partial credit generously for correct reasoning even when the wording
differs from the model answer — judge the substance, not the phrasing.

Also return short "feedback" (1-3 sentences): what the student got right, and
what was missing or wrong.

Return ONLY a JSON object, no markdown fences, no commentary:
{ "points": <0.0-1.0>, "feedback": "..." }`;

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * AI-grade a free-text answer against the question's model answer. Returns a
 * 0–1 score with partial credit plus short feedback. Throws on an LLM / parse
 * failure — callers treat that as non-fatal (score 0, manual-review note).
 */
export async function gradeWrittenAnswer(
  prompt: string,
  modelAnswer: string,
  explanation: string | null,
  studentText: string,
  model?: string
): Promise<WrittenGrade> {
  const result = await completion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `QUESTION:\n${prompt}\n\n` +
          `MODEL ANSWER:\n${modelAnswer}\n\n` +
          `WORKED SOLUTION:\n${explanation ?? '(none provided)'}\n\n` +
          `STUDENT ANSWER:\n${studentText}`,
      },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  let parsed: { points?: unknown; feedback?: unknown };
  try {
    parsed = JSON.parse(stripFences(result.content));
  } catch {
    throw new Error('Grader returned invalid JSON');
  }

  return {
    points: clamp01(Number(parsed.points)),
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
  };
}
