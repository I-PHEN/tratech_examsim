import { completion } from '../../lib/llm';

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json|markdown|md)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// A line that starts a new question: "Q1", "Q 1.", "Question 3", "1.", "1)",
// "(2)", "[4]". Deliberately anchored at line start so prose like "in 1." mid
// sentence is never treated as a boundary.
const QUESTION_HEAD_RE =
  /^\s*(?:(?:Q(?:uestion)?\s*\.?\s*)?\d{1,3}\s*[.)\]:]|\(\s*\d{1,3}\s*\)|\[\s*\d{1,3}\s*\])/i;

/**
 * Deterministic, loss-less partition of exam text by question-number headers.
 * The concatenation of the result is exactly the input (minus trimming) — it
 * never rewrites, drops, or truncates content. This is the robust fallback and
 * the engine behind the manual "Auto-split" button.
 */
export function partitionByQuestionNumber(text: string): string[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.forEach((ln, i) => {
    if (QUESTION_HEAD_RE.test(ln)) starts.push(i);
  });
  if (starts.length <= 1) return [text.trim()].filter(Boolean);

  const segments: string[] = [];
  // Preamble before the first numbered question (rubric/instructions) — keep it
  // attached to question 1 rather than dropping it.
  let preamble = '';
  if (starts[0] > 0) preamble = lines.slice(0, starts[0]).join('\n').trim();

  for (let k = 0; k < starts.length; k++) {
    const from = starts[k];
    const to = k + 1 < starts.length ? starts[k + 1] : lines.length;
    let block = lines.slice(from, to).join('\n').trim();
    if (k === 0 && preamble) block = `${preamble}\n\n${block}`;
    if (block) segments.push(block);
  }
  return segments;
}

const SPLIT_SYSTEM = `You locate question boundaries in numbered exam text. You do NOT rewrite, classify, answer, or summarise — you only report WHERE each question starts.

The input is the exam text with every line prefixed by "<n>| " (1-based line numbers).

OUTPUT: return ONLY a JSON object, no markdown fences, no commentary:
{ "starts": [<line number where Q1 starts>, <line number where Q2 starts>, ...] }

RULES:
1. "starts" is the ascending list of line numbers (the numbers in the "<n>|" prefix) where each NEW question begins.
2. A question with a shared setup paragraph then sub-parts (a),(b),(c) is ONE question — use only the line where the whole question begins.
3. Ignore page headers, mark tables, and rubric/instruction lines — do not start a question on them.
4. If you genuinely cannot find multiple questions, return { "starts": [] }.`;

/**
 * Split-only, LOSS-LESS. The model picks boundary line numbers; we slice the
 * ORIGINAL text by those lines, so no content can ever be rewritten or lost.
 * Falls back to the deterministic partition on any anomaly.
 */
export async function splitIntoQuestions(text: string, model?: string): Promise<string[]> {
  if (!text.trim()) return [];
  const lines = text.split('\n');
  const numbered = lines.map((ln, i) => `${i + 1}| ${ln}`).join('\n');

  let starts: number[] = [];
  try {
    const result = await completion({
      messages: [
        { role: 'system', content: SPLIT_SYSTEM },
        { role: 'user', content: numbered },
      ],
      model,
      responseFormat: 'json_object',
      temperature: 0,
    });
    const parsed = JSON.parse(stripFences(result.content)) as { starts?: unknown };
    if (Array.isArray(parsed.starts)) {
      starts = parsed.starts
        .map((n) => Math.floor(Number(n)) - 1) // → 0-based line index
        .filter((n) => Number.isInteger(n) && n >= 0 && n < lines.length);
    }
  } catch {
    starts = [];
  }

  // Validate: strictly ascending, at least 2 boundaries — else fall back.
  const ascending = starts.every((v, i) => i === 0 || v > starts[i - 1]);
  if (starts.length < 2 || !ascending) {
    return partitionByQuestionNumber(text);
  }

  const segments: string[] = [];
  if (starts[0] > 0) {
    const pre = lines.slice(0, starts[0]).join('\n').trim();
    if (pre) starts.unshift(0);
  }
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k];
    const to = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const block = lines.slice(from, to).join('\n').trim();
    if (block) segments.push(block);
  }
  return segments.length > 0 ? segments : partitionByQuestionNumber(text);
}

const FORMAT_SYSTEM = `You are a typesetting normaliser for STEM exam content. You receive raw text (often from OCR or a paste) and return the SAME content with correct formatting — you do NOT change, solve, add, or remove any content.

Return ONLY the reformatted text. No commentary, no code fences.

RULES:
1. CONTENT IS IMMUTABLE. Never change numbers, variables, wording, or meaning. Only fix how it is written.
2. MATH. Wrap inline math in single $...$ and display/standalone equations in $$...$$ (LaTeX/KaTeX). Convert "x^2" → $x^{2}$, fractions, integrals, Greek letters, etc.
3. CHEMISTRY. Use proper sub/superscripts: H2O → $H_{2}O$, CO2 → $CO_{2}$, Ca^2+ → $Ca^{2+}$. Reaction arrows: -> → $\\rightarrow$, <=> → $\\rightleftharpoons$.
4. UNITS. Render units clearly, e.g. "mol/(L.s)" → $\\mathrm{mol\\,L^{-1}\\,s^{-1}}$ or "mol·L⁻¹·s⁻¹". Keep the original unit system.
5. STRUCTURE. Use Markdown: lists for step-by-step, **bold** for emphasis already implied, tables only if the source is tabular. Preserve line/step breaks.
6. If the text is already clean, return it unchanged.`;

/** Normalise raw/ambiguous text into clean Markdown + LaTeX. Content-preserving. */
export async function normalizeFormatting(text: string, model?: string): Promise<string> {
  if (!text.trim()) return text;
  const result = await completion({
    messages: [
      { role: 'system', content: FORMAT_SYSTEM },
      { role: 'user', content: text },
    ],
    model,
    responseFormat: 'text',
    temperature: 0,
  });
  const out = stripFences(result.content);
  return out.length > 0 ? out : text;
}
