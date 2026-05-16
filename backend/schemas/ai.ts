import { z } from 'zod';

export const ChatRequest = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1),
      })
    )
    .min(1),
  model: z.string().min(1).optional(),
});

export type ChatRequestInput = z.infer<typeof ChatRequest>;
