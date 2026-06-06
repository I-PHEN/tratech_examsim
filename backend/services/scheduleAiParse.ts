export interface ParsedModelOutput {
  message: string;
  proposals: unknown[];
}

/**
 * Parse the model's JSON reply. Tolerates a ```json fenced block and missing
 * keys; throws only when the content is not parseable JSON at all.
 */
export function parseModelOutput(content: string): ParsedModelOutput {
  let text = content.trim();
  // Strip a ```json ... ``` (or plain ``` ... ```) fence if present.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  const data = JSON.parse(text) as Record<string, unknown>;
  const message = typeof data.message === 'string' ? data.message : '';
  const proposals = Array.isArray(data.proposals) ? (data.proposals as unknown[]) : [];
  return { message, proposals };
}
