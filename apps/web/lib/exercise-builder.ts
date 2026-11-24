export type QuestionType =
  | "MULTIPLE_CHOICE"
  | "FILL_BLANK"
  | "IMAGE_MATCH"
  | "SENTENCE_ORDER"
  | "READ_ALOUD";

export type Option = { id: string; text: string };
export type BlankRule = {
  id: string;
  acceptedAnswers: string[];
  trim: boolean;
  caseSensitive: boolean;
  collapseWhitespace: boolean;
};
export type ImagePair = {
  id: string;
  imageAssetId?: string;
  imageKey?: string;
  label: string;
  altText?: string;
};
export type SentenceBlock = { id: string; text: string };
export type Question = {
  id: string;
  sectionId?: string;
  type: QuestionType;
  order: number;
  points: number;
  prompt?: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown>;
  explanation?: string;
  grading?: Record<string, unknown>;
};
export type BuilderDraft = {
  _id: string;
  assignmentId: string;
  assignmentTitle: string;
  courseId: string;
  versionNumber: number;
  revision: number;
  status: string;
  sections: Array<{ id: string; title: string; order: number }>;
  questions: Question[];
};

const fallbackSection = { id: "section-1", title: "Exercises", order: 0 };

/** Converts persisted exercise JSON into safe values for the no-code editor. */
export function toBuilderDraft(raw: BuilderDraft): BuilderDraft {
  const sections = raw.sections?.length ? raw.sections : [fallbackSection];
  return {
    ...raw,
    sections,
    questions: (raw.questions ?? []).map((question, order) => ({
      ...question,
      order,
      sectionId: question.sectionId ?? sections[0].id,
      points: Number.isFinite(question.points) ? question.points : 1,
      prompt: question.prompt ?? "",
      content: question.content ?? {},
      answerKey: question.answerKey ?? {},
      explanation: question.explanation ?? "",
    })),
  };
}

/** Converts the visual editor state to the canonical API JSON contract. */
export function toDraftPayload(draft: BuilderDraft) {
  const sections = draft.sections.length ? draft.sections : [fallbackSection];
  return {
    expectedRevision: draft.revision,
    sections: sections.map((section, order) => ({ ...section, order })),
    questions: draft.questions.map((question, order) => ({
      ...question,
      order,
      sectionId: question.sectionId ?? sections[0].id,
    })),
  };
}
