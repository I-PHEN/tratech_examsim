import { z } from 'zod';
import { uuid } from './common';

export const ProgramCreate = z.object({
  department_id: uuid,
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
});

export const ProgramUpdate = ProgramCreate.partial();

export const ProgramListQuery = z.object({
  department_id: uuid.optional(),
});
