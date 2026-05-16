import { z } from 'zod';

export const CourseCreate = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
});

export const CourseUpdate = CourseCreate.partial();

export const CourseListQuery = z.object({
  q: z.string().min(1).optional(),
});
