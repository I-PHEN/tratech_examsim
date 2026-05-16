import { z } from 'zod';
import { uuid } from './common';

export const TopicCreate = z.object({
  program_course_id: uuid,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const TopicUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export const TopicListQuery = z.object({
  program_course_id: uuid,
});
