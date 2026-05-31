import { z } from 'zod';
import { AnswerType, Difficulty, ExamScope, uuid } from './common';

const McqOption = z.object({
  text: z.string().min(1),
  is_correct: z.boolean(),
});

/**
 * One labeled answer field of a multi-input calc question (e.g. C_A, X). Each
 * field is graded independently against its own exact/range spec and unit.
 */
const AnswerField = z.object({
  label: z.string().min(1).max(120),
  correct_answer: z.string().min(1),
  answer_type: z.enum(['exact', 'range']),
  answer_tolerance: z.number().positive().optional(),
  unit: z.string().optional(),
});

/** Every `range` field must carry a tolerance. */
function refineAnswerFields(
  fields: z.infer<typeof AnswerField>[] | undefined,
  ctx: z.RefinementCtx
) {
  if (!fields) return;
  fields.forEach((f, i) => {
    if (f.answer_type === 'range' && !f.answer_tolerance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer_fields', i, 'answer_tolerance'],
        message: 'Range answer fields require answer_tolerance',
      });
    }
  });
}

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
    // For answer_type 'written' this holds the worded model answer. Optional
    // because answer_type 'multi' carries answers in answer_fields instead.
    correct_answer: z.string().min(1).optional(),
    answer_tolerance: z.number().positive().optional(),
    unit: z.string().optional(),
    source_reference: z.string().max(500).optional(),
    shared_stem: z.string().optional(),
  }),
  // Present only when answer_type === 'multi'.
  answer_fields: z.array(AnswerField).min(2).max(8).optional(),
});

/** A calc question carries answers either in content.correct_answer (single) or answer_fields (multi). */
function refineCalcAnswers(
  input: { answer_type: string; content: { correct_answer?: string }; answer_fields?: z.infer<typeof AnswerField>[] },
  ctx: z.RefinementCtx
) {
  if (input.answer_type === 'multi') {
    if (!input.answer_fields || input.answer_fields.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer_fields'],
        message: 'Multi-input questions require at least 2 answer fields',
      });
    }
    refineAnswerFields(input.answer_fields, ctx);
  } else if (!input.content.correct_answer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content', 'correct_answer'],
      message: 'correct_answer is required',
    });
  }
}

export const QuestionCreate = z
  .discriminatedUnion('type', [McqCreate, CalcCreate])
  .superRefine((input, ctx) => {
    if (input.type === 'calc') refineCalcAnswers(input, ctx);
  });
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
    correct_answer: z.string().min(1).optional(),
    answer_tolerance: z.number().positive().optional(),
    unit: z.string().optional(),
    source_reference: z.string().max(500).optional(),
    shared_stem: z.string().optional(),
  }),
  answer_fields: z.array(AnswerField).min(2).max(8).optional(),
});

export const QuestionUpdate = z
  .discriminatedUnion('type', [McqUpdate, CalcUpdate])
  .superRefine((input, ctx) => {
    if (input.type === 'calc') refineCalcAnswers(input, ctx);
  });
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
