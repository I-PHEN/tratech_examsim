import { z } from 'zod';

export const uuid = z.string().uuid();

export const QuestionType = z.enum(['mcq', 'calc']);
export const Difficulty = z.enum(['easy', 'medium', 'hard']);
export const ExamScope = z.enum(['midsem', 'final', 'both']);
// 'multi' marks a calc question with multiple labeled answer fields (see
// question_answer_fields). Each field carries its own exact/range spec.
export const AnswerType = z.enum(['exact', 'range', 'written', 'multi']);
export const StudyMode = z.enum(['practice', 'diagnostic', 'midsem', 'full_exam']);

export const IdParam = z.object({ id: uuid });
