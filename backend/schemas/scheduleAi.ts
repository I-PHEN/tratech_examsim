import { z } from 'zod';

// Browser-supplied context so relative phrases ("next Monday 6pm", "until June
// 20") resolve in the user's wall-clock. `today` is the user's local date.
export const AiDraftRequest = z.object({
  text: z.string().trim().min(1, 'Tell me what to practice and when.').max(1000),
  timezone: z.string().min(1, 'timezone is required'),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be "YYYY-MM-DD"'),
});

export type AiDraftRequestInput = z.infer<typeof AiDraftRequest>;
