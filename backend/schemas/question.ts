import { z } from 'zod';
import { AnswerType, Difficulty, ExamScope, uuid } from './common';

const McqOption = z.object({
  text: z.string().min(1),
  is_correct: z.boolean(),
});

/** Links sub-parts (a, b, c) of one source question. Optional on every question. */
const GroupFields = {
  question_group_id: uuid.optional(),
  part_label: z.string().max(8).optional(),
  part_index: z.number().int().min(0).optional(),
};

const McqCreate = z.object({
  program_course_id: uuid,
  topic_id: uuid,
  type: z.literal('mcq'),
  difficulty: Difficulty,
  exam_scope: ExamScope,
  ...GroupFields,
  content: z.object({
    prompt: z.string().min(1),
    explanation: z.string().optional(),
    source_reference: z.string().max(500).optional(),
    // The shared setup for a multi-part question — identical on every sibling
    // part, so the exam UI renders it once + each part's task underneath.
    shared_stem: z.string().optional(),
  }),
  options: z.array(McqOption).min(2).max(6),
});

const CalcCreate = z.object({
  program_course_id: uuid,
  topic_id: uuid,
  type: z.literal('calc'),
  difficulty: Difficulty,
  exam_scope: ExamScope,
  answer_type: AnswerType,
  ...GroupFields,
  content: z.object({
    prompt: z.string().min(1),
    explanation: z.string().optional(),
    // For answer_type 'written' this holds the worded model answer.
    correct_answer: z.string().min(1),
    answer_tolerance: z.number().positive().optional(),
    unit: z.string().optional(),
    source_reference: z.string().max(500).optional(),
    shared_stem: z.string().optional(),
  }),
});

export const QuestionCreate = z.discriminatedUnion('type', [McqCreate, CalcCreate]);
export type QuestionCreateInput = z.infer<typeof QuestionCreate>;

const McqUpdate = z.object({
  topic_id: uuid,
  type: z.literal('mcq'),
  difficulty: Difficulty,
  exam_scope: ExamScope,
  content: z.object({
    prompt: z.string().min(1),
    explanation: z.string().optional(),
    source_reference: z.string().max(500).optional(),
    shared_stem: z.string().optional(),
  }),
  options: z.array(McqOption).min(2).max(6),
});

const CalcUpdate = z.object({
  topic_id: uuid,
  type: z.literal('calc'),
  difficulty: Difficulty,
  exam_scope: ExamScope,
  answer_type: AnswerType,
  content: z.object({
    prompt: z.string().min(1),
    explanation: z.string().optional(),
    correct_answer: z.string().min(1),
    answer_tolerance: z.number().positive().optional(),
    unit: z.string().optional(),
    source_reference: z.string().max(500).optional(),
    shared_stem: z.string().optional(),
  }),
});

export const QuestionUpdate = z.discriminatedUnion('type', [McqUpdate, CalcUpdate]);
export type QuestionUpdateInput = z.infer<typeof QuestionUpdate>;

/** Apply edits to every sibling of a multi-part group in one call. */
export const QuestionGroupUpdate = z.object({
  shared: z
    .object({
      topic_id: uuid.optional(),
      difficulty: Difficulty.optional(),
      exam_scope: ExamScope.optional(),
      shared_stem: z.string().optional(),
    })
    .optional(),
  parts: z.array(z.intersection(QuestionUpdate, z.object({ id: uuid }))).min(1),
});
export type QuestionGroupUpdateInput = z.infer<typeof QuestionGroupUpdate>;

export const QuestionListQuery = z.object({
  program_course_id: uuid.optional(),
  topic_id: uuid.optional(),
  type: z.enum(['mcq', 'calc']).optional(),
  difficulty: Difficulty.optional(),
  exam_scope: ExamScope.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
