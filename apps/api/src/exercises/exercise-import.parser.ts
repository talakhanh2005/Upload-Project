import { createHash } from "node:crypto";
import { ExerciseQuestionType } from "../common/domain.js";
import type { ExerciseQuestion, ExerciseSection, ValidationIssue } from "./exercise.types.js";
import { validateExercise } from "./exercise.validation.js";

function parseFrontMatter(source: string) {
  const metadata: Record<string, string> = {};
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return metadata;
  for (const line of match[1].split(/\r?\n/)) {
    const parts = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (parts) metadata[parts[1]] = parts[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return metadata;
}

export function parseExerciseImport(source: string) {
  const metadata = parseFrontMatter(source);
  const errors: ValidationIssue[] = [];
  const questions: ExerciseQuestion[] = [];
  const block = /```exercise\s*\r?\n([\s\S]*?)\r?\n```/g;
  for (const match of source.matchAll(block)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    try {
      const parsed = JSON.parse(match[1]) as ExerciseQuestion;
      if (!parsed || typeof parsed !== "object") throw new Error("Exercise block must contain a JSON object");
      parsed.order = Number.isFinite(parsed.order) ? parsed.order : questions.length;
      if (!Object.values(ExerciseQuestionType).includes(parsed.type)) throw new Error(`Unsupported type: ${String(parsed.type)}`);
      questions.push(parsed);
    } catch (error) {
      errors.push({ path: "source", line, message: error instanceof Error ? error.message : "Invalid exercise JSON" });
    }
  }
  if (!questions.length && !errors.length) errors.push({ path: "source", message: "No ```exercise blocks found" });
  const sectionId = "section-1";
  const sections: ExerciseSection[] = [{ id: sectionId, title: metadata.section || "Exercises", order: 0 }];
  for (const question of questions) question.sectionId = question.sectionId || sectionId;
  const report = validateExercise(sections, questions);
  return { metadata, sections, questions, sha256: createHash("sha256").update(source).digest("hex"), valid: errors.length === 0 && report.valid, errors: [...errors, ...report.errors], warnings: report.warnings, totalPoints: report.totalPoints };
}
