import { z } from 'zod';
import { Difficulty, StudyMode, uuid } from './common';

export const SessionPickQuery = z.object({
  program_course_id: uuid,
  mode: StudyMode,
  count: z.coerce.number().int().min(1).max(100).optional(),
  topic_id: uuid.optional(),
  difficulty: Difficulty.optional(),
});

export type SessionPickInput = z.infer<typeof SessionPickQuery>;

export const SessionCreate = z.object({
  program_course_id: uuid,
  mode: StudyMode,
  count: z.coerce.number().int().min(1).max(100).optional(),
  topic_id: uuid.optional(),
  difficulty: Difficulty.optional(),
});
export type SessionCreateInput = z.infer<typeof SessionCreate>;

export const SessionAnswerSubmit = z
  .object({
    question_id: uuid,
    position: z.coerce.number().int().min(0),
    picked_option_id: uuid.optional(),
    picked_text: z.string().max(8000).optional(),
    // Multi-input (answer_type 'multi'): one entry per labeled answer field.
    picked_fields: z
      .array(z.object({ position: z.coerce.number().int().min(0), text: z.string().max(8000) }))
      .max(8)
      .optional(),
    time_ms: z.coerce.number().int().min(0).optional(),
  })
  .refine(
    (d) =>
      d.picked_option_id !== undefined ||
      d.picked_text !== undefined ||
      d.picked_fields !== undefined,
    {
      message: 'Either picked_option_id, picked_text, or picked_fields must be provided',
    }
  );
export type SessionAnswerSubmitInput = z.infer<typeof SessionAnswerSubmit>;

export const SessionFinish = z.object({
  duration_ms: z.coerce.number().int().min(0).optional(),
});
export type SessionFinishInput = z.infer<typeof SessionFinish>;

export const SessionListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
