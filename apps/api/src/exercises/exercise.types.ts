import { ExerciseQuestionType } from "../common/domain.js";

export type ExerciseSection = { id: string; title: string; order: number };
export type ExerciseQuestion = {
  id: string;
  sectionId?: string;
  type: ExerciseQuestionType;
  order: number;
  points: number;
  prompt?: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown>;
  explanation?: string;
  grading?: Record<string, unknown>;
};
export type ExerciseAnswer = { questionId: string; payload: Record<string, unknown> };
export type ValidationIssue = { path: string; message: string; questionId?: string; line?: number };
export type ValidationReport = { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[]; totalPoints: number };

