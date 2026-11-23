import { ExerciseQuestionType } from "../common/domain.js";
import { gradeExercise } from "./exercise.grading.js";
import { parseExerciseImport } from "./exercise-import.parser.js";
import type { ExerciseQuestion } from "./exercise.types.js";
import { sanitizeQuestions, validateExercise } from "./exercise.validation.js";

const questions: ExerciseQuestion[] = [
  { id: "mcq", type: ExerciseQuestionType.MULTIPLE_CHOICE, order: 0, points: 1, content: { options: [{ id: "a", text: "Rice" }, { id: "b", text: "Milk" }] }, answerKey: { correctOptionId: "b" }, explanation: "Hidden" },
  { id: "fill", type: ExerciseQuestionType.FILL_BLANK, order: 1, points: 2, content: { template: "Drink [[b1]]" }, answerKey: { blanks: [{ id: "b1", acceptedAnswers: ["milk"], trim: true, caseSensitive: false, collapseWhitespace: true }] } },
  { id: "match", type: ExerciseQuestionType.IMAGE_MATCH, order: 2, points: 2, content: { pairs: [{ id: "p1", imageAssetId: "asset-1", label: "Apple" }, { id: "p2", imageAssetId: "asset-2", label: "Milk" }] } },
  { id: "order", type: ExerciseQuestionType.SENTENCE_ORDER, order: 3, points: 2, content: { blocks: [{ id: "t1", text: "She" }, { id: "t2", text: "runs." }] }, answerKey: { correctBlockIds: ["t1", "t2"] } },
  { id: "voice", type: ExerciseQuestionType.READ_ALOUD, order: 4, points: 3, content: { passage: "Read this.", maxDurationSeconds: 30 } },
];

describe("interactive exercise core", () => {
  it("validates all five supported question types", () => expect(validateExercise([], questions)).toMatchObject({ valid: true, totalPoints: 10 }));
  it("never exposes answer keys or explanations in student questions", () => {
    const result = sanitizeQuestions(questions);
    expect(result[0]).not.toHaveProperty("answerKey");
    expect(result[0]).not.toHaveProperty("explanation");
    expect(result[2].content).not.toHaveProperty("pairs");
  });
  it("grades deterministic questions with partial fill and match credit", () => {
    const result = gradeExercise(questions, [
      { questionId: "mcq", payload: { selectedOptionId: "b" } },
      { questionId: "fill", payload: { blanks: { b1: "  Milk " } } },
      { questionId: "match", payload: { matches: { p1: "p1", p2: "wrong" } } },
      { questionId: "order", payload: { selectedBlockIds: ["t1", "t2"] } },
    ]);
    expect(result.autoPoints).toBe(6);
    expect(result.needsReview).toBe(true);
  });
  it("parses strict exercise fences and reports source lines", () => {
    const imported = parseExerciseImport(`---\ntitle: Test\n---\n\n\`\`\`exercise\n${JSON.stringify(questions[0])}\n\`\`\``);
    expect(imported.valid).toBe(true);
    expect(imported.metadata.title).toBe("Test");
    expect(imported.questions).toHaveLength(1);
  });
  it("does not strip Vietnamese diacritics while normalizing fill answers", () => {
    const vietnamese: ExerciseQuestion[] = [{ ...questions[1], answerKey: { blanks: [{ id: "b1", acceptedAnswers: ["sữa"], caseSensitive: false }] } }];
    expect(gradeExercise(vietnamese, [{ questionId: "fill", payload: { blanks: { b1: "SỮA" } } }]).autoPoints).toBe(2);
    expect(gradeExercise(vietnamese, [{ questionId: "fill", payload: { blanks: { b1: "sua" } } }]).autoPoints).toBe(0);
  });
});
