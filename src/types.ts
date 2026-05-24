/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StudyMode = 'PRACTICE' | 'MIDSEM' | 'FULL_EXAM' | 'DIAGNOSTIC';

export type QuestionType = 'MCQ' | 'INPUT';

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: string[];
  marks: number;
  optionIds?: string[];
  correctOptionId?: string;
  correctAnswer?: string;
  unit?: string;
  assets?: { id: string; url: string }[];
  /** 'written' → free-text answer graded by AI; otherwise numeric. */
  answerType?: 'exact' | 'range' | 'written';
  /** Multi-part grouping — sub-parts of one source question. */
  groupId?: string;
  partLabel?: string;
  partIndex?: number;
  groupSize?: number;
  /** Setup shared by every sibling part — rendered ONCE above the part's prompt. */
  sharedStem?: string;
}

export interface Topic {
  id: string;
  name: string;
  questionsCount?: number;
  mastery?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

export interface TimerSession {
  startedAt: number;
  durationMs: number;
  totalPausedMs: number;
  pauseCount: number;
  pausedAt: number | null;
}

export interface Course {
  id: string;
  name: string;
  description?: string;
  year?: 'Year 1' | 'Year 2' | 'Year 3' | 'Year 4';
  semester?: 'Sem 1' | 'Sem 2';
  topics?: Topic[];
}

export interface AppState {
  step: 'MODE_SELECT' | 'COURSE_SELECT' | 'TOPIC_SELECT' | 'READY' | 'EXAM' | 'REVIEW' | 'TARGETED_PRACTICE' | 'SESSIONS_HISTORY' | 'PERFORMANCE' | 'SETTINGS' | 'HELP';
  returnStep?: 'MODE_SELECT' | 'COURSE_SELECT' | 'TOPIC_SELECT' | 'READY' | 'EXAM' | 'REVIEW' | 'TARGETED_PRACTICE' | 'SESSIONS_HISTORY' | 'PERFORMANCE' | 'SETTINGS' | 'HELP';
  mode: StudyMode | null;
  selectedCourse: Course | null;
  selectedTopic: Topic | null;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'All';
  questionCount: number;
  year: 'Year 1' | 'Year 2' | 'Year 3' | 'Year 4';
  semester: 'Sem 1' | 'Sem 2';
  practiceTimeLimit: number;
  reviewSessionId?: string;
}
