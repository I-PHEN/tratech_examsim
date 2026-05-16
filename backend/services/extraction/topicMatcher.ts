import { completion } from '../../lib/openrouter';
import type { ExtractedDraft, TopicHint } from './classifier';

export interface TopicMatch {
  question_index: number;
  topic_id: string | null;
  confidence: number;
}

const CHUNK_SIZE = 20;

async function matchChunk(
  questions: Array<{ index: number; prompt: string }>,
  topics: TopicHint[],
  model?: string
): Promise<TopicMatch[]> {
  const topicList = topics
    .map((t) => `  - ${t.id}: ${t.name}${t.description ? `\n    Description: ${t.description}` : ''}`)
    .join('\n');

  const questionList = questions
    .map((q) => `  [${q.index}] ${q.prompt.slice(0, 300)}`)
    .join('\n');

  const result = await completion({
    messages: [
      {
        role: 'system',
        content: `Match each question to the most semantically appropriate topic. Return ONLY JSON: { "matches": [{ "question_index": <int>, "topic_id": "<uuid or null>", "confidence": <0.0-1.0> }] }. If no topic fits well, use topic_id: null. Never invent UUIDs.`,
      },
      {
        role: 'user',
        content: `TOPICS:\n${topicList}\n\nQUESTIONS:\n${questionList}`,
      },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  let parsed: { matches?: TopicMatch[] };
  try {
    parsed = JSON.parse(result.content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim());
  } catch {
    return [];
  }
  return parsed.matches ?? [];
}

export async function matchTopics(
  drafts: ExtractedDraft[],
  topics: TopicHint[],
  model?: string
): Promise<TopicMatch[]> {
  if (topics.length === 0 || drafts.length === 0) return [];

  const indexed = drafts.map((d, i) => ({ index: i, prompt: d.prompt }));
  const results: TopicMatch[] = [];

  for (let i = 0; i < indexed.length; i += CHUNK_SIZE) {
    const chunk = indexed.slice(i, i + CHUNK_SIZE);
    const matches = await matchChunk(chunk, topics, model);
    results.push(...matches);
  }

  return results;
}
