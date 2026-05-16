import { z } from 'zod';
import { uuid } from './common';

export const TopicSuggestText = z.object({
  source_type: z.literal('text'),
  program_course_id: uuid,
  text: z.string().min(10).max(50000),
  model: z.string().min(1).max(200).optional(),
});

export const TopicSuggestImages = z.object({
  source_type: z.literal('images'),
  program_course_id: uuid,
  images: z.array(z.string().min(1)).min(1).max(20),
  model: z.string().min(1).max(200).optional(),
});

export const TopicSuggestRequest = z.discriminatedUnion('source_type', [
  TopicSuggestText,
  TopicSuggestImages,
]);

export type TopicSuggestInput = z.infer<typeof TopicSuggestRequest>;
