import 'dotenv/config';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-120b';
// Groq on-demand TPM is 8000 for gpt-oss-120b; (prompt + max_tokens) must fit
// under that, so the default ceiling is well below 8000 and individual callers
// can opt up if their prompts are small.
const DEFAULT_MAX_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 4000;

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<TextPart | ImagePart>;
};

export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image_url'; image_url: { url: string } };

export interface CompletionOptions {
  model?: string;
  messages: ChatMessage[];
  responseFormat?: 'json_object' | 'text';
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

function getKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not configured');
  return key;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [2000, 5000, 12000];

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function completion(opts: CompletionOptions): Promise<{ content: string }> {
  const body: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    messages: opts.messages,
    stream: false,
  };
  if (opts.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  body.max_tokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

  let lastErrorText = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      lastStatus = response.status;
      lastErrorText = await response.text();

      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        const wait = retryAfter ?? DEFAULT_BACKOFF_MS[attempt - 1];
        console.warn(
          `[groq] ${response.status} for ${body.model}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`
        );
        await sleep(wait);
        continue;
      }
      throw new Error(`Groq error ${response.status}: ${lastErrorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string; error?: { message?: string } }>;
      error?: { message?: string; code?: number | string };
    };

    if (data.error) {
      const code = Number(data.error.code);
      if (RETRYABLE_STATUSES.has(code) && attempt < MAX_ATTEMPTS) {
        const wait = DEFAULT_BACKOFF_MS[attempt - 1];
        console.warn(
          `[groq] body-error ${code} for ${body.model}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`
        );
        await sleep(wait);
        continue;
      }
      throw new Error(
        `Groq returned error (model=${body.model}): ${data.error.message ?? JSON.stringify(data.error)}`
      );
    }

    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';

    if (!content) {
      const finish = choice?.finish_reason ?? 'no_choice';
      const upstream = choice?.error?.message;
      const snippet = JSON.stringify(data).slice(0, 400);
      throw new Error(
        `Groq returned empty content (model=${body.model}, finish_reason=${finish}${
          upstream ? `, upstream=${upstream}` : ''
        }). Raw: ${snippet}`
      );
    }

    return { content };
  }

  throw new Error(`Groq error ${lastStatus} after ${MAX_ATTEMPTS} attempts: ${lastErrorText}`);
}

export async function streamingFetch(opts: CompletionOptions): Promise<Response> {
  const body = {
    model: opts.model || DEFAULT_MODEL,
    messages: opts.messages,
    stream: true,
    // gpt-oss is a reasoning model: at the default effort it burns many seconds
    // (and tokens) on hidden reasoning before emitting a single content token,
    // which looks like a hung tutor. 'low' keeps replies fast and on-point.
    reasoning_effort: 'low',
    // (prompt + max_tokens) must stay under Groq's on-demand TPM cap.
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Groq streaming error ${response.status}: ${errText}`);
  }

  return response;
}
