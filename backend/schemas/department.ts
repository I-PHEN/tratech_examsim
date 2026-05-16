import { z } from 'zod';

export const DepartmentCreate = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
});

export const DepartmentUpdate = DepartmentCreate.partial();
