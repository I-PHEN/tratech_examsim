import { z } from 'zod';
import { Difficulty, ExamScope, uuid } from './common';

const DocType = z.enum(['past_paper', 'slides', 'handwritten']).default('past_paper');

export const TextJobCreate = z.object({
  source_type: z.literal('text'),
  text: z.string().min(10),
  program_course_id: uuid,
  default_exam_scope: ExamScope.optional(),
  model: z.string().min(1).max(200).optional(),
  doc_type: DocType.optional(),
});

export const FileJobMeta = z.object({
  source_type: z.enum(['pdf', 'image']),
  program_course_id: uuid,
  default_exam_scope: ExamScope.optional(),
  model: z.string().min(1).max(200).optional(),
  doc_type: DocType.optional(),
});

export const JobListQuery = z.object({
  status: z.enum(['pending', 'extracting', 'ready_for_review', 'published', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const McqOption = z.object({
  text: z.string().min(1),
  is_correct: z.boolean(),
});

export const DraftData = z.object({
  type: z.enum(['mcq', 'calc']),
  prompt: z.string().min(1),
  difficulty: Difficulty.optional(),
  topic_id: uuid.optional(),
  exam_scope: ExamScope.optional(),
  options: z.array(McqOption).optional(),
  correct_answer: z.string().optional(),
  answer_type: z.enum(['exact', 'range']).optional(),
  answer_tolerance: z.number().positive().optional(),
  unit: z.string().optional(),
  explanation: z.string().optional(),
  raw_text: z.string().optional(),
});

export const DraftUpdate = z.object({
  draft_data: DraftData.optional(),
  status: z.enum(['pending', 'rejected']).optional(),
});

export type DraftDataInput = z.infer<typeof DraftData>;
