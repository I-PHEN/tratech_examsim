import { z } from 'zod';
import { uuid } from './common';

export const ProgramCourseCreate = z.object({
  program_id: uuid,
  course_id: uuid,
  year_level: z.coerce.number().int().min(1).max(6),
  semester: z.coerce.number().int().min(1).max(2),
});

export const ProgramCourseUpdate = ProgramCourseCreate.partial();

export const ProgramCourseListQuery = z.object({
  program_id: uuid.optional(),
  department_id: uuid.optional(),
  year_level: z.coerce.number().int().min(1).max(6).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
});
