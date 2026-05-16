import { completion } from '../../lib/openrouter';

export interface VerifyResult {
  complete: boolean;
  missing: string[];
}

export async function verifyQuestion(
  prompt: string,
  sourceText: string,
  model?: string
): Promise<VerifyResult> {
  const result = await completion({
    messages: [
      {
        role: 'system',
        content: `You are a strict completeness checker for exam questions.
Given a source OCR transcript and an extracted question prompt, identify any data, numbers, units, conditions, equations, or clauses that are PRESENT in the source but MISSING from the extracted prompt.
Be strict — even a missing unit, constant, or single numerical value counts as missing.
Return ONLY JSON: { "complete": <boolean>, "missing": ["item1", "item2"] }
If nothing is missing, return { "complete": true, "missing": [] }.`,
      },
      {
        role: 'user',
        content: `SOURCE TRANSCRIPT:\n${sourceText.slice(0, 4000)}\n\nEXTRACTED PROMPT:\n${prompt}`,
      },
    ],
    model,
    responseFormat: 'json_object',
    temperature: 0,
  });

  try {
    const parsed = JSON.parse(
      result.content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    ) as VerifyResult;
    return {
      complete: parsed.complete === true,
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    };
  } catch {
    return { complete: true, missing: [] };
  }
}
