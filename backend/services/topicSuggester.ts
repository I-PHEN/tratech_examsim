import { completion, type ChatMessage } from '../lib/openrouter';

export interface ProposedTopic {
  name: string;
  description: string;
  confidence: number;
}

export type SuggesterInput =
  | { kind: 'text'; text: string }
  | { kind: 'images'; pngBase64: string[] };

const SYSTEM_PROMPT = `You are a curriculum analyst. You read a course syllabus, outline, or table of contents and extract the LIST OF TOPICS the course covers.

Return ONLY a JSON object of this shape, no markdown, no commentary:
{
  "topics": [
    {
      "name": "<short topic name, 2-6 words>",
      "description": "<1-2 sentences listing the subtopics, key concepts, and typical question patterns under this topic>",
      "confidence": <0.0-1.0>
    }
  ]
}

RULES:
1. EXTRACT, DO NOT INVENT. Only return topics that are explicitly listed or clearly implied in the source. If the source is vague, return fewer topics with lower confidence.
2. GRANULARITY. Aim for topic-level groupings, not chapter-level summaries and not nitty-gritty sub-points. Typically 8-15 topics for a full course.
3. DESCRIPTIONS. Must be specific enough that an AI matching exam questions to this topic later can do so accurately. Include subtopics, common keywords, and question patterns (e.g. "Rate Laws: order of reaction, integrated rate laws, half-life, rate constant determination, method of initial rates, Arrhenius equation").
4. NAMES. Concise, exam-style. Avoid "Chapter 3:" prefixes or roman numerals.
5. CONFIDENCE. Your conviction that this topic genuinely belongs in this course based on what you see. Below 0.6 means you're guessing.`;

function buildUserContent(input: SuggesterInput): ChatMessage['content'] {
  if (input.kind === 'text') return input.text;
  return input.pngBase64.map((b64) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/png;base64,${b64}` },
  }));
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

export async function suggestTopicsFromSource(
  input: SuggesterInput,
  model?: string
): Promise<ProposedTopic[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserContent(input) },
  ];

  const result = await completion({
    messages,
    model,
    responseFormat: 'json_object',
    temperature: 0.2,
  });

  const content = stripFences(result.content);

  let parsed: { topics?: ProposedTopic[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.topics)) return [];
  return parsed.topics
    .filter(
      (t): t is ProposedTopic =>
        t !== null &&
        typeof t === 'object' &&
        typeof t.name === 'string' &&
        t.name.length > 0
    )
    .map((t) => ({
      name: t.name,
      description: typeof t.description === 'string' ? t.description : '',
      confidence: typeof t.confidence === 'number' ? t.confidence : 0,
    }));
}
