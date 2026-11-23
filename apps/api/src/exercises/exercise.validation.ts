import { ExerciseQuestionType } from "../common/domain.js";
import type { ExerciseQuestion, ExerciseSection, ValidationIssue, ValidationReport } from "./exercise.types.js";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const issue = (question: ExerciseQuestion, path: string, message: string): ValidationIssue => ({ questionId: question.id, path: `questions.${question.id}.${path}`, message });

export function validateExercise(sections: ExerciseSection[], questions: ExerciseQuestion[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!Array.isArray(questions) || questions.length === 0) errors.push({ path: "questions", message: "Exercise must contain at least one question" });
  if (questions.length > 100) errors.push({ path: "questions", message: "Exercise cannot contain more than 100 questions" });
  const ids = new Set<string>();
  const sectionIds = new Set((sections ?? []).map((section) => section.id));
  for (const question of questions ?? []) {
    if (!nonEmpty(question.id) || ids.has(question.id)) errors.push(issue(question, "id", "Question id must be non-empty and unique"));
    ids.add(question.id);
    if (!Object.values(ExerciseQuestionType).includes(question.type)) errors.push(issue(question, "type", "Unsupported question type"));
    if (typeof question.points !== "number" || !Number.isFinite(question.points) || question.points <= 0 || question.points > 100) errors.push(issue(question, "points", "Points must be greater than 0 and at most 100"));
    if (question.sectionId && !sectionIds.has(question.sectionId)) errors.push(issue(question, "sectionId", "Referenced section does not exist"));
    if (!object(question.content)) { errors.push(issue(question, "content", "Content must be an object")); continue; }
    const key = object(question.answerKey) ? question.answerKey : {};
    if (question.type === ExerciseQuestionType.MULTIPLE_CHOICE) {
      const options = Array.isArray(question.content.options) ? question.content.options.filter(object) : [];
      const optionIds = options.map((option) => option.id).filter(nonEmpty);
      if (options.length < 2 || options.length > 6) errors.push(issue(question, "content.options", "Multiple choice requires 2 to 6 options"));
      if (optionIds.length !== options.length || new Set(optionIds).size !== optionIds.length || options.some((option) => !nonEmpty(option.text))) errors.push(issue(question, "content.options", "Every option needs a unique id and non-empty text"));
      if (!nonEmpty(key.correctOptionId) || !optionIds.includes(key.correctOptionId)) errors.push(issue(question, "answerKey.correctOptionId", "Correct option must reference an existing option"));
    }
    if (question.type === ExerciseQuestionType.FILL_BLANK) {
      const template = question.content.template;
      const markers = nonEmpty(template) ? [...template.matchAll(/\[\[([A-Za-z0-9_-]+)\]\]/g)].map((match) => match[1]) : [];
      const blanks = Array.isArray(key.blanks) ? key.blanks.filter(object) : [];
      if (!markers.length) errors.push(issue(question, "content.template", "Template must contain at least one [[blankId]] marker"));
      if (new Set(markers).size !== markers.length) warnings.push(issue(question, "content.template", "A blank marker is used more than once"));
      for (const marker of new Set(markers)) {
        const blank = blanks.find((item) => item.id === marker);
        if (!blank || !Array.isArray(blank.acceptedAnswers) || blank.acceptedAnswers.length === 0 || blank.acceptedAnswers.some((answer) => !nonEmpty(answer))) errors.push(issue(question, `answerKey.blanks.${marker}`, "Every marker needs at least one accepted answer"));
      }
    }
    if (question.type === ExerciseQuestionType.IMAGE_MATCH) {
      const pairs = Array.isArray(question.content.pairs) ? question.content.pairs.filter(object) : [];
      const pairIds = pairs.map((pair) => pair.id).filter(nonEmpty);
      if (pairs.length < 2 || pairs.length > 10) errors.push(issue(question, "content.pairs", "Image match requires 2 to 10 pairs"));
      if (pairIds.length !== pairs.length || new Set(pairIds).size !== pairIds.length || pairs.some((pair) => !nonEmpty(pair.label) || (!nonEmpty(pair.imageAssetId) && !nonEmpty(pair.imageKey)))) errors.push(issue(question, "content.pairs", "Every pair needs a unique id, image reference and label"));
      if (pairs.some((pair) => nonEmpty(pair.imageKey) && !nonEmpty(pair.imageAssetId))) warnings.push(issue(question, "content.pairs", "Image keys must be mapped to uploaded assets before publish"));
    }
    if (question.type === ExerciseQuestionType.SENTENCE_ORDER) {
      const blocks = Array.isArray(question.content.blocks) ? question.content.blocks.filter(object) : [];
      const blockIds = blocks.map((block) => block.id).filter(nonEmpty);
      const correct = Array.isArray(key.correctBlockIds) ? key.correctBlockIds : [];
      if (blocks.length < 2 || blockIds.length !== blocks.length || new Set(blockIds).size !== blockIds.length || blocks.some((block) => !nonEmpty(block.text))) errors.push(issue(question, "content.blocks", "Sentence order needs at least two blocks with unique ids and text"));
      if (correct.length !== blockIds.length || correct.some((id) => !blockIds.includes(id as string)) || new Set(correct).size !== correct.length) errors.push(issue(question, "answerKey.correctBlockIds", "Correct sequence must contain every block exactly once"));
    }
    if (question.type === ExerciseQuestionType.READ_ALOUD) {
      if (!nonEmpty(question.content.passage)) errors.push(issue(question, "content.passage", "Read aloud requires a passage"));
      const duration = question.content.maxDurationSeconds ?? 120;
      if (typeof duration !== "number" || duration < 3 || duration > 120) errors.push(issue(question, "content.maxDurationSeconds", "Duration must be between 3 and 120 seconds"));
    }
  }
  return { valid: errors.length === 0, errors, warnings, totalPoints: questions.reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0) };
}

export function sanitizeQuestions(questions: ExerciseQuestion[]) {
  return questions.map(({ answerKey: _answerKey, explanation: _explanation, grading: _grading, ...question }) => {
    if (question.type !== ExerciseQuestionType.IMAGE_MATCH) return question;
    const pairs = Array.isArray(question.content.pairs) ? question.content.pairs.filter(object) : [];
    const safeContent = { ...question.content };
    delete safeContent.pairs;
    return { ...question, content: { ...safeContent, images: pairs.map((pair) => ({ id: pair.id, imageAssetId: pair.imageAssetId, imageKey: pair.imageKey, altText: pair.altText })), labels: pairs.map((pair) => ({ id: pair.id, text: pair.label })) } };
  });
}

