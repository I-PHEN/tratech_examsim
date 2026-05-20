import { z } from 'zod';
import { Difficulty, ExamScope, uuid } from './common';

const DocType = z.enum(['past_paper', 'slides', 'handwritten']).default('past_paper');

export const JobMode = z.enum(['autonomous', 'stepwise']);

export const TextJobCreate = z.object({
  source_type: z.literal('text'),
  text: z.string().min(10),
  program_course_id: uuid,
  default_exam_scope: ExamScope.optional(),
  model: z.string().min(1).max(200).optional(),
  doc_type: DocType.optional(),
  mode: JobMode.optional(),
});

export const FileJobMeta = z.object({
  source_type: z.enum(['pdf', 'image']),
  program_course_id: uuid,
  default_exam_scope: ExamScope.optional(),
  model: z.string().min(1).max(200).optional(),
  doc_type: DocType.optional(),
  mode: JobMode.optional(),
});

export const JobListQuery = z.object({
  status: z
    .enum([
      'pending',
      'uploaded',
      'extracting',
      'text_review',
      'structuring',
      'ready_for_review',
      'published',
      'failed',
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  archived: z
    .union([z.literal('true'), z.literal('false'), z.literal('all')])
    .optional(),
});

export const ReviewedTextUpdate = z.object({
  reviewed_text: z.string(),
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
  source_reference: z.string().max(500).optional(),
  solution_image_path: z.string().optional(),
  solution_image_mime: z.string().optional(),
});

export const DraftUpdate = z.object({
  draft_data: DraftData.optional(),
  status: z.enum(['pending', 'rejected']).optional(),
});

export type DraftDataInput = z.infer<typeof DraftData>;

/** Global metadata applied to every manually-structured segment (per-question overridable). */
export const SegmentGlobal = z.object({
  topic_id: uuid.optional(),
  exam_scope: ExamScope.optional(),
  difficulty: Difficulty.optional(),
  source_reference: z.string().max(500).optional(),
});

export const SegmentsCreate = z.object({
  segments: z.array(z.string().min(1)).min(1),
  global: SegmentGlobal.optional(),
});

export const FormatTextInput = z.object({
  text: z.string().min(1).max(20000),
});

export type SegmentGlobalInput = z.infer<typeof SegmentGlobal>;
