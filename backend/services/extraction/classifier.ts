import { completion } from '../../lib/llm';

export interface ExtractedDraft {
  type: 'mcq' | 'calc';
  prompt: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic_id?: string;
  options?: Array<{ text: string; is_correct: boolean }>;
  correct_answer?: string;
  answer_type?: 'exact' | 'range' | 'written';
  answer_tolerance?: number;
  unit?: string;
  explanation?: string;
  confidence?: number;
  source_page?: number;
  /**
   * Sub-part labels (e.g. ["a","b","c"]) when this is a multi-part question.
   * The question stays ONE draft here — a later split pass divides it.
   */
  part_labels?: string[];
}

export interface TopicHint {
  id: string;
  name: string;
  description?: string | null;
}

const FEW_SHOT = `EXAMPLE — a multi-part question stays ONE record:

Source transcript:
  Q3. A first-order reaction A → B is carried out isothermally in a batch reactor.
       Initial concentration is 2.0 mol/L. After 30 minutes, the concentration of A is 0.5 mol/L.
       (a) Determine the rate constant k.
       (b) Calculate the time required for 90% conversion of A.

Output (ONE record — the whole question; "part_labels" lists its sub-parts):
  {
    "questions": [
      {
        "type": "calc",
        "prompt": "Q3. A first-order reaction $A \\rightarrow B$ is carried out isothermally in a batch reactor. Initial concentration is $2.0\\ \\mathrm{mol/L}$. After 30 minutes, the concentration of $A$ is $0.5\\ \\mathrm{mol/L}$.\\n\\n(a) Determine the rate constant $k$.\\n\\n(b) Calculate the time required for 90% conversion of $A$.",
        "difficulty": "medium",
        "part_labels": ["a", "b"],
        "confidence": 0.95,
        "source_page": 1
      }
    ]
  }`;

function buildSystemPrompt(docType: string): string {
  const filterRule =
    docType === 'slides'
      ? 'This is a lecture slide deck. Be AGGRESSIVE at filtering — only include explicit exam-style questions that a student is expected to solve. Skip all lecture notes, definitions, explanations, and examples.'
      : docType === 'handwritten'
      ? 'This is a handwritten exam paper or exercise sheet. Include all student-facing questions. Be lenient about formatting irregularities.'
      : 'This is a past exam paper. Include every question that a student is expected to solve.';

  return `You are an exam-question classifier. You receive the verbatim OCR text of one exam page.
Your ONLY job: identify every question a student must solve, and copy each one's full text VERBATIM.

SOURCE TYPE: ${filterRule}

OUTPUT FORMAT — return ONLY a JSON object, no markdown fences, no commentary:
{
  "questions": [
    {
      "type": "mcq" | "calc",
      "prompt": "<COMPLETE question text — see Rule 1>",
      "difficulty": "easy" | "medium" | "hard",
      "options": [{"text": "...", "is_correct": true | false}],
      "correct_answer": "<only if explicitly shown in source>",
      "answer_type": "exact" | "range" | "written",
      "answer_tolerance": <number>,
      "unit": "<unit for calc answer, omit if none>",
      "explanation": "<the COMPLETE worked solution if the source shows one — see Rule 4b>",
      "part_labels": ["<sub-part labels e.g. a, b, c — ONLY for multi-part questions, see Rule 2>"],
      "confidence": <0.0-1.0>,
      "source_page": <integer>
    }
  ]
}

RULES — these are absolute:

1. COMPLETENESS. The "prompt" field MUST be VERBATIM from the source — every number, unit, condition, equation, given datum, and clause the student needs to solve it. Do NOT summarise, paraphrase, abbreviate, or omit anything. Treat each prompt as if the student has NO access to the source document.

2. MULTI-PART. When a question has sub-parts (a), (b), (c), (i), (ii), etc., keep it as ONE record — do NOT split it. The "prompt" field MUST contain the COMPLETE question: the shared setup / given-data paragraph followed by EVERY sub-part verbatim, in order. List the sub-part labels in "part_labels" (e.g. ["a","b","c"]), exactly as they appear in the source. A later step splits the parts apart and assigns each its own answer — your only job here is to capture the whole question intact and flag it. A standalone question with NO sub-parts MUST omit "part_labels" entirely.

2b. FORMATTING. The "prompt", "options[].text" and "explanation" fields MUST be valid Markdown + LaTeX (rendered with KaTeX), WITHOUT changing any content:
   - Inline math in single $...$, standalone equations in $$...$$ (e.g. x^2 → $x^{2}$, fractions, integrals, Greek letters).
   - Chemistry with proper sub/superscripts: H2O → $H_{2}O$, CO2 → $CO_{2}$, Ca2+ → $Ca^{2+}$; reaction arrows → $\\rightarrow$ / $\\rightleftharpoons$.
   - Units rendered clearly, e.g. mol/(L.s) → $\\mathrm{mol\\,L^{-1}\\,s^{-1}}$.
   - Use Markdown lists for step-by-step working in "explanation". Keep numbers, variables, and wording EXACTLY as in the source — formatting only.

3. MCQ. Requires "options" array with 2–6 entries, exactly ONE is_correct: true (only if the source states the answer). NEVER guess the correct option.

4. CALC. "prompt" required. "correct_answer" OPTIONAL — only include if the source explicitly shows it. Set "answer_type":
   - "exact"  — the answer is a single value matched exactly.
   - "range"  — the answer is a number accepted within a tolerance (also set "answer_tolerance").
   - "written" — the expected answer is a worded statement / explanation / interpretation rather than a single value (e.g. "state and justify…", "explain what this implies…", or a calculation that must be CONCLUDED in words). For "written", put the model answer (the worded answer) in "correct_answer".

4b. EXPLANATION / WORKED SOLUTION. If the source shows a worked solution for a question, copy it into "explanation" VERBATIM — every sentence, every intermediate result, every aside, every line of working. DO NOT paraphrase, abbreviate, condense, or skip prose between math steps. If the source has a sentence explaining WHY a step is taken, that sentence MUST appear in your "explanation". End with the final answer stated as a clear sentence. This solution belongs to the question; it is NOT an "example" to skip (see Rule 6).

5. DIFFICULTY. Estimate. Default "medium" when unsure.

6. SKIP. Skip only material that is NOT a student question to solve: definitions, theory blurbs, lecture notes, standalone fully-worked teaching examples, and instructions. Do NOT discard a worked solution that accompanies a real question — that goes in this question's "explanation" (Rule 4b).

7. CONFIDENCE. Your confidence in the full record (0.0–1.0).

8. SOURCE_PAGE. Use the page number from the header you were given.

${FEW_SHOT}`;
}

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

export async function classifyPage(
  text: string,
  pageNumber: number,
  docType: string,
  topics: TopicHint[],
  model?: string
): Promise<ExtractedDraft[]> {
  if (!text.trim()) return [];

  const topicContext =
    topics.length > 0
      ? `\n\nAVAILABLE TOPICS — for each question, add "topic_id" matching the best topic UUID:\n${topics
          .map((t) => `  - ${t.id}: ${t.name}${t.description ? `\n    Description: ${t.description}` : ''}`)
          .join('\n')}`
      : '';

  const userContent = `--- PAGE ${pageNumber} ---\n${text}${topicContext}`;

  const result = await completion({
    messages: [
      { role: 'system', content: buildSystemPrompt(docType) },
      { role: 'user', content: userContent },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  let parsed: { questions?: ExtractedDraft[] };
  try {
    parsed = JSON.parse(stripFences(result.content));
  } catch {
    throw new Error(`Classifier returned invalid JSON for page ${pageNumber}: ${result.content.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.questions)) return [];
  return parsed.questions
    .filter((q) => q && typeof q.prompt === 'string' && q.prompt.length > 0)
    .map((q) => ({ ...q, source_page: q.source_page ?? pageNumber }));
}

export async function classifyPageWithRetry(
  text: string,
  pageNumber: number,
  docType: string,
  topics: TopicHint[],
  missingItems: string[],
  model?: string
): Promise<ExtractedDraft[]> {
  const retryNote = `\n\n[RETRY NOTE] The previous extraction missed these items: ${missingItems.join(', ')}. Re-extract the question and ensure every listed item appears verbatim in the "prompt" field.`;

  const topicContext =
    topics.length > 0
      ? `\n\nAVAILABLE TOPICS:\n${topics
          .map((t) => `  - ${t.id}: ${t.name}${t.description ? `\n    Description: ${t.description}` : ''}`)
          .join('\n')}`
      : '';

  const userContent = `--- PAGE ${pageNumber} ---\n${text}${topicContext}${retryNote}`;

  const result = await completion({
    messages: [
      { role: 'system', content: buildSystemPrompt(docType) },
      { role: 'user', content: userContent },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  let parsed: { questions?: ExtractedDraft[] };
  try {
    parsed = JSON.parse(stripFences(result.content));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.questions)) return [];
  return parsed.questions
    .filter((q) => q && typeof q.prompt === 'string' && q.prompt.length > 0)
    .map((q) => ({ ...q, source_page: q.source_page ?? pageNumber }));
}
