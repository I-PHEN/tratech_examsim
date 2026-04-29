/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StudyMode = 'PRACTICE' | 'MIDSEM' | 'FULL_EXAM';

export type QuestionType = 'MCQ' | 'INPUT';

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: string[]; // For MCQ
  marks: number;
}

export interface Topic {
  id: string;
  name: string;
  questionsCount: number;
  mastery: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
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
  description: string;
  topics: Topic[];
}

export interface AppState {
  step: 'MODE_SELECT' | 'COURSE_SELECT' | 'TOPIC_SELECT' | 'READY' | 'EXAM';
  mode: StudyMode | null;
  selectedCourse: Course | null;
  selectedTopic: Topic | null;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'All';
  questionCount: 5 | 10 | 20;
}

export const COURSES: Course[] = [
  {
    id: 'heat-transfer',
    name: 'Heat Transfer',
    description: 'Conduction, convection, and radiation analysis.',
    topics: [
      { id: 'conduction', name: 'Steady State Conduction', questionsCount: 120, mastery: 45, difficulty: 'Easy' },
      { id: 'convection', name: 'Forced Convection', questionsCount: 95, mastery: 30, difficulty: 'Medium' },
      { id: 'radiation', name: 'Radiation Exchange', questionsCount: 80, mastery: 15, difficulty: 'Hard' }
    ]
  },
  {
    id: 'thermo-2',
    name: 'Thermodynamics 2',
    description: 'Advanced cycles, gas mixtures, and combustion.',
    topics: [
      { id: 'power-cycles', name: 'Gas Power Cycles', questionsCount: 150, mastery: 65, difficulty: 'Medium' },
      { id: 'vapor-cycles', name: 'Vapor Power Cycles', questionsCount: 110, mastery: 40, difficulty: 'Hard' },
      { id: 'refrigeration', name: 'Refrigeration Systems', questionsCount: 85, mastery: 80, difficulty: 'Easy' }
    ]
  },
  {
    id: 'basic-mechanics',
    name: 'Basic Mechanics',
    description: 'Statics and dynamics of particles and rigid bodies.',
    topics: [
      { id: 'statics', name: 'Equilibrium of Particles', questionsCount: 130, mastery: 90, difficulty: 'Easy' },
      { id: 'dynamics', name: 'Kinetics of Particles', questionsCount: 105, mastery: 55, difficulty: 'Medium' },
      { id: 'friction', name: 'Laws of Friction', questionsCount: 75, mastery: 20, difficulty: 'Medium' }
    ]
  },
  {
    id: 'chem-kinetics',
    name: 'Chemical Reaction Kinetics',
    description: 'Reaction rates, reactor design, and enzyme kinetics.',
    topics: [
      { id: 'rate-laws', name: 'Rate Laws & Reaction Order', questionsCount: 150, mastery: 30, difficulty: 'Easy' },
      { id: 'arrhenius', name: 'Arrhenius Equation', questionsCount: 85, mastery: 60, difficulty: 'Medium' },
      { id: 'batch-reactor', name: 'Batch Reactor Design', questionsCount: 120, mastery: 10, difficulty: 'Hard' },
      { id: 'enzyme-kinetics', name: 'Enzyme Kinetics', questionsCount: 90, mastery: 45, difficulty: 'Easy' },
      { id: 'residence-time', name: 'Residence Time', questionsCount: 60, mastery: 80, difficulty: 'Medium' },
      { id: 'elementary', name: 'Elementary Reactions', questionsCount: 110, mastery: 20, difficulty: 'Easy' }
    ]
  }
];
