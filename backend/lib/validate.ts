import type { ZodSchema } from 'zod';

export const parse = <T>(schema: ZodSchema<T>, data: unknown): T => schema.parse(data);
