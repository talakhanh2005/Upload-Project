import { ExerciseQuestionType } from "../common/domain.js";
import type { ExerciseAnswer, ExerciseQuestion } from "./exercise.types.js";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sameSequence = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, index) => value === right[index]);
function normalize(value: unknown, rule: Record<string, unknown>) {
  let result = typeof value === "string" ? value.normalize("NFC") : "";
  if (rule.trim !== false) result = result.trim();
  if (rule.collapseWhitespace !== false) result = result.replace(/\s+/g, " ");
  if (rule.caseSensitive !== true) result = result.toLocaleLowerCase();
  return result;
}

export function gradeExercise(questions: ExerciseQuestion[], answers: ExerciseAnswer[]) {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer.payload]));
  const questionScores: Array<{ questionId: string; points: number; maxPoints: number }> = [];
  let needsReview = false;
  for (const question of questions) {
    const payload = byQuestion.get(question.id) ?? {};
    const key = object(question.answerKey) ? question.answerKey : {};
    let points = 0;
    if (question.type === ExerciseQuestionType.MULTIPLE_CHOICE) points = payload.selectedOptionId === key.correctOptionId ? question.points : 0;
    if (question.type === ExerciseQuestionType.FILL_BLANK) {
      const values = object(payload.blanks) ? payload.blanks : {};
      const blanks = Array.isArray(key.blanks) ? key.blanks.filter(object) : [];
      const correct = blanks.filter((blank) => Array.isArray(blank.acceptedAnswers) && blank.acceptedAnswers.some((answer) => normalize(values[String(blank.id)], blank) === normalize(answer, blank))).length;
      points = blanks.length ? question.points * correct / blanks.length : 0;
    }
    if (question.type === ExerciseQuestionType.IMAGE_MATCH) {
      const matches = object(payload.matches) ? payload.matches : {};
      const pairs = Array.isArray(question.content.pairs) ? question.content.pairs.filter(object) : [];
      const correct = pairs.filter((pair) => matches[String(pair.id)] === pair.id).length;
      points = pairs.length ? question.points * correct / pairs.length : 0;
    }
    if (question.type === ExerciseQuestionType.SENTENCE_ORDER) {
      const selected = Array.isArray(payload.selectedBlockIds) ? payload.selectedBlockIds : [];
      const correct = Array.isArray(key.correctBlockIds) ? key.correctBlockIds : [];
      points = sameSequence(selected, correct) ? question.points : 0;
    }
    if (question.type === ExerciseQuestionType.READ_ALOUD) needsReview = true;
    questionScores.push({ questionId: question.id, points: Math.round(points * 10000) / 10000, maxPoints: question.points });
  }
  return { autoPoints: Math.round(questionScores.reduce((sum, score) => sum + score.points, 0) * 10000) / 10000, needsReview, questionScores };
}

