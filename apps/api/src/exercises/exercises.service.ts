import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { Model, Types } from "mongoose";
import { Assignment, type AssignmentDocument } from "../assignments/assignment.schema.js";
import { AssignmentKind, CourseStatus, EditorStatus, ExerciseAttemptStatus, ExerciseGradingStatus, ExerciseQuestionType, Role, type JwtPrincipal } from "../common/domain.js";
import { Course, type CourseDocument } from "../courses/course.schema.js";
import { Enrollment, type EnrollmentDocument } from "../courses/enrollment.schema.js";
import { ExerciseAttempt, type ExerciseAttemptDocument } from "./exercise-attempt.schema.js";
import { ExerciseAsset, type ExerciseAssetDocument } from "./exercise-asset.schema.js";
import { gradeExercise } from "./exercise.grading.js";
import { parseExerciseImport } from "./exercise-import.parser.js";
import type { CommitImportDto, SaveAnswersDto, UpdateExerciseDraftDto } from "./exercises.dto.js";
import type { ExerciseAnswer, ExerciseQuestion, ExerciseSection } from "./exercise.types.js";
import { ExerciseVersion, type ExerciseVersionDocument } from "./exercise-version.schema.js";
import { sanitizeQuestions, validateExercise } from "./exercise.validation.js";
import { StorageService } from "../storage/storage.service.js";

const asId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestException("Invalid id");
  return new Types.ObjectId(id);
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

@Injectable()
export class ExercisesService {
  constructor(
    @InjectModel(Assignment.name) private assignments: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private enrollments: Model<EnrollmentDocument>,
    @InjectModel(ExerciseVersion.name) private versions: Model<ExerciseVersionDocument>,
    @InjectModel(ExerciseAttempt.name) private attempts: Model<ExerciseAttemptDocument>,
    @InjectModel(ExerciseAsset.name) private assets: Model<ExerciseAssetDocument>,
    private storage: StorageService,
  ) {}

  private async assignment(id: string) {
    const assignment = await this.assignments.findOne({ _id: asId(id), deleted: false });
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.kind !== AssignmentKind.INTERACTIVE) throw new BadRequestException("Assignment is not interactive");
    return assignment;
  }
  private async teacherAssignment(id: string, user: JwtPrincipal) {
    const assignment = await this.assignment(id);
    const course = await this.courses.findById(assignment.courseId);
    if (!course) throw new NotFoundException("Course not found");
    if (user.role !== Role.ADMIN && (user.role !== Role.TEACHER || course.teacherId.toString() !== user.sub)) throw new ForbiddenException();
    return { assignment, course };
  }
  private async studentAssignment(id: string, user: JwtPrincipal, requireOpen = false) {
    if (user.role !== Role.STUDENT) throw new ForbiddenException();
    const assignment = await this.assignment(id);
    const course = await this.courses.findById(assignment.courseId);
    if (!course || !(await this.enrollments.exists({ courseId: assignment.courseId, studentId: asId(user.sub), active: true }))) throw new ForbiddenException();
    if (requireOpen) {
      const now = new Date();
      if (course.status !== CourseStatus.ACTIVE || assignment.isManuallyLocked || (assignment.opensAt && now < assignment.opensAt) || (assignment.closesAt && now > assignment.closesAt)) throw new ForbiddenException("Exercise is closed");
    }
    return { assignment, course };
  }
  private async draftFor(assignment: AssignmentDocument, user: JwtPrincipal) {
    let draft = await this.versions.findOne({ assignmentId: assignment._id, status: EditorStatus.DRAFT });
    if (!draft) {
      const latest = await this.versions.findOne({ assignmentId: assignment._id }).sort({ versionNumber: -1 });
      draft = await this.versions.create({ assignmentId: assignment._id, versionNumber: (latest?.versionNumber ?? 0) + 1, status: EditorStatus.DRAFT, sections: latest?.sections ?? [], questions: latest?.questions ?? [], createdBy: asId(user.sub), revision: 0 });
      assignment.editorStatus = EditorStatus.DRAFT;
      await assignment.save();
    }
    return draft;
  }

  async getDraft(id: string, user: JwtPrincipal) {
    const { assignment } = await this.teacherAssignment(id, user);
    return this.draftFor(assignment, user);
  }
  async updateDraft(id: string, dto: UpdateExerciseDraftDto, user: JwtPrincipal) {
    const { assignment } = await this.teacherAssignment(id, user);
    const draft = await this.draftFor(assignment, user);
    if (draft.revision !== dto.expectedRevision) throw new ConflictException({ message: "Draft was changed elsewhere", currentRevision: draft.revision });
    draft.sections = dto.sections as ExerciseSection[];
    draft.questions = dto.questions as ExerciseQuestion[];
    draft.revision += 1;
    return draft.save();
  }
  async validate(id: string, user: JwtPrincipal) {
    const draft = await this.getDraft(id, user);
    return validateExercise(draft.sections, draft.questions);
  }
  async publish(id: string, user: JwtPrincipal) {
    const { assignment } = await this.teacherAssignment(id, user);
    const draft = await this.versions.findOne({ assignmentId: assignment._id, status: EditorStatus.DRAFT });
    if (!draft) throw new ConflictException("There is no draft version to publish");
    const report = validateExercise(draft.sections, draft.questions);
    if (!report.valid) throw new BadRequestException({ message: "Exercise contains validation errors", ...report });
    const unresolvedImages = draft.questions.some((question) => question.type === ExerciseQuestionType.IMAGE_MATCH && Array.isArray(question.content.pairs) && question.content.pairs.some((pair) => object(pair) && !pair.imageAssetId));
    if (unresolvedImages) throw new BadRequestException("Map every imageKey to an imageAssetId before publishing");
    draft.status = EditorStatus.PUBLISHED;
    draft.publishedAt = new Date();
    draft.contentHash = createHash("sha256").update(JSON.stringify({ sections: draft.sections, questions: draft.questions })).digest("hex");
    await draft.save();
    assignment.activeExerciseVersionId = draft._id;
    assignment.editorStatus = EditorStatus.PUBLISHED;
    await assignment.save();
    return { versionId: draft.id, versionNumber: draft.versionNumber, publishedAt: draft.publishedAt, totalPoints: report.totalPoints };
  }

  previewImport(source: string) { return parseExerciseImport(source); }
  async commitImport(courseId: string, dto: CommitImportDto, user: JwtPrincipal) {
    const course = await this.courses.findById(asId(courseId));
    if (!course) throw new NotFoundException("Course not found");
    if (user.role !== Role.ADMIN && (user.role !== Role.TEACHER || course.teacherId.toString() !== user.sub)) throw new ForbiddenException();
    const parsed = parseExerciseImport(dto.source);
    if (!parsed.valid) throw new BadRequestException({ message: "Import contains validation errors", errors: parsed.errors, warnings: parsed.warnings });
    let assignment: AssignmentDocument;
    if (dto.assignmentId) assignment = (await this.teacherAssignment(dto.assignmentId, user)).assignment;
    else assignment = await this.assignments.create({ courseId: course._id, title: parsed.metadata.title || dto.sourceName || "Imported exercise", instructions: parsed.metadata.notes || "", deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : new Date(Date.now() + 7 * 86400000), createdBy: asId(user.sub), kind: AssignmentKind.INTERACTIVE, editorStatus: EditorStatus.DRAFT });
    const draft = await this.draftFor(assignment, user);
    draft.sections = parsed.sections;
    draft.questions = parsed.questions;
    draft.revision += 1;
    await draft.save();
    return { assignment, draft, warnings: parsed.warnings, sha256: parsed.sha256 };
  }

  private shuffled(ids: string[], seed: string) {
    const values = [...ids];
    let state = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
    for (let index = values.length - 1; index > 0; index--) { state = (state * 1664525 + 1013904223) >>> 0; const target = state % (index + 1); [values[index], values[target]] = [values[target], values[index]]; }
    if (values.length > 1 && values.every((value, index) => value === ids[index])) [values[0], values[1]] = [values[1], values[0]];
    return values;
  }
  private presentation(questions: ExerciseQuestion[], seed: string) {
    return Object.fromEntries(questions.map((question) => {
      if (question.type === ExerciseQuestionType.MULTIPLE_CHOICE) return [question.id, { optionIds: this.shuffled((question.content.options as Array<{ id: string }>).map((item) => item.id), `${seed}:${question.id}:options`) }];
      if (question.type === ExerciseQuestionType.IMAGE_MATCH) { const ids = (question.content.pairs as Array<{ id: string }>).map((item) => item.id); return [question.id, { imageIds: this.shuffled(ids, `${seed}:${question.id}:images`), labelIds: this.shuffled(ids, `${seed}:${question.id}:labels`) }]; }
      if (question.type === ExerciseQuestionType.SENTENCE_ORDER) return [question.id, { blockIds: this.shuffled((question.content.blocks as Array<{ id: string }>).map((item) => item.id), `${seed}:${question.id}:blocks`) }];
      return [question.id, {}];
    }));
  }
  private studentPayload(version: ExerciseVersionDocument, attempt?: ExerciseAttemptDocument) {
    return { version: { id: version.id, versionNumber: version.versionNumber, sections: version.sections, questions: sanitizeQuestions(version.questions) }, attempt: attempt ? { id: attempt.id, status: attempt.status, answers: attempt.answers, presentation: attempt.presentation, revision: attempt.revision, attemptNumber: attempt.attemptNumber, lastSavedAt: attempt.lastSavedAt, submittedAt: attempt.submittedAt } : undefined };
  }
  async getPublished(id: string, user: JwtPrincipal) {
    const { assignment } = await this.studentAssignment(id, user);
    if (!assignment.activeExerciseVersionId) throw new NotFoundException("Exercise has not been published");
    const version = await this.versions.findById(assignment.activeExerciseVersionId);
    if (!version) throw new NotFoundException("Published exercise version not found");
    return this.studentPayload(version);
  }
  async start(id: string, user: JwtPrincipal) {
    const { assignment } = await this.studentAssignment(id, user, true);
    let attempt = await this.attempts.findOne({ assignmentId: assignment._id, studentId: asId(user.sub), status: ExerciseAttemptStatus.IN_PROGRESS });
    if (attempt) { const version = await this.versions.findById(attempt.exerciseVersionId); if (!version) throw new NotFoundException(); return this.studentPayload(version, attempt); }
    const count = await this.attempts.countDocuments({ assignmentId: assignment._id, studentId: asId(user.sub) });
    if (count >= (assignment.maxAttempts ?? 1)) throw new ForbiddenException("No attempts remaining");
    if (!assignment.activeExerciseVersionId) throw new NotFoundException("Exercise has not been published");
    const version = await this.versions.findById(assignment.activeExerciseVersionId);
    if (!version) throw new NotFoundException();
    attempt = await this.attempts.create({ assignmentId: assignment._id, exerciseVersionId: version._id, courseId: assignment.courseId, studentId: asId(user.sub), attemptNumber: count + 1, status: ExerciseAttemptStatus.IN_PROGRESS, answers: [], presentation: {}, revision: 0, startedAt: new Date() });
    attempt.presentation = this.presentation(version.questions, attempt.id);
    await attempt.save();
    return this.studentPayload(version, attempt);
  }
  private async studentAttempt(id: string, user: JwtPrincipal) {
    const attempt = await this.attempts.findById(asId(id));
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (user.role !== Role.STUDENT || attempt.studentId.toString() !== user.sub) throw new ForbiddenException();
    return attempt;
  }
  async resume(id: string, user: JwtPrincipal) {
    const attempt = await this.studentAttempt(id, user);
    const version = await this.versions.findById(attempt.exerciseVersionId);
    if (!version) throw new NotFoundException();
    return this.studentPayload(version, attempt);
  }
  async saveAnswers(id: string, dto: SaveAnswersDto, user: JwtPrincipal) {
    const attempt = await this.studentAttempt(id, user);
    if (attempt.status !== ExerciseAttemptStatus.IN_PROGRESS) throw new ConflictException("Submitted attempts cannot be changed");
    if (attempt.revision !== dto.expectedRevision) throw new ConflictException({ message: "Answers were changed elsewhere", currentRevision: attempt.revision });
    const version = await this.versions.findById(attempt.exerciseVersionId);
    if (!version) throw new NotFoundException();
    const questionIds = new Set(version.questions.map((question) => question.id));
    const answers = dto.answers as ExerciseAnswer[];
    if (answers.some((answer) => !object(answer) || typeof answer.questionId !== "string" || !questionIds.has(answer.questionId) || !object(answer.payload)) || new Set(answers.map((answer) => answer.questionId)).size !== answers.length) throw new BadRequestException("Answers must reference unique questions in this exercise");
    attempt.answers = answers;
    attempt.revision += 1;
    attempt.lastSavedAt = new Date();
    await attempt.save();
    return { revision: attempt.revision, lastSavedAt: attempt.lastSavedAt };
  }
  async submit(id: string, submissionKey: string | undefined, user: JwtPrincipal) {
    const attempt = await this.studentAttempt(id, user);
    if (attempt.status === ExerciseAttemptStatus.SUBMITTED) return { id: attempt.id, status: attempt.status, gradingStatus: attempt.gradingStatus, autoPoints: attempt.autoPoints, submittedAt: attempt.submittedAt };
    await this.studentAssignment(attempt.assignmentId.toString(), user, true);
    const version = await this.versions.findById(attempt.exerciseVersionId);
    if (!version) throw new NotFoundException();
    const result = gradeExercise(version.questions, attempt.answers);
    attempt.status = ExerciseAttemptStatus.SUBMITTED;
    attempt.autoPoints = result.autoPoints;
    attempt.questionScores = result.questionScores;
    attempt.gradingStatus = result.needsReview ? ExerciseGradingStatus.NEEDS_REVIEW : ExerciseGradingStatus.READY_TO_PUBLISH;
    attempt.submittedAt = new Date();
    attempt.submissionKey = submissionKey;
    attempt.revision += 1;
    await attempt.save();
    return { id: attempt.id, status: attempt.status, gradingStatus: attempt.gradingStatus, autoPoints: attempt.autoPoints, submittedAt: attempt.submittedAt };
  }

  async listAttempts(assignmentId: string, user: JwtPrincipal) { const { assignment } = await this.teacherAssignment(assignmentId, user); return this.attempts.find({ assignmentId: assignment._id }).sort({ submittedAt: -1 }).lean(); }
  private async teacherAttempt(id: string, user: JwtPrincipal) { const attempt = await this.attempts.findById(asId(id)); if (!attempt) throw new NotFoundException(); await this.teacherAssignment(attempt.assignmentId.toString(), user); return attempt; }
  async review(id: string, user: JwtPrincipal) { const attempt = await this.teacherAttempt(id, user); const version = await this.versions.findById(attempt.exerciseVersionId); return { attempt, version }; }
  async manualGrade(id: string, manualPoints: number, user: JwtPrincipal) { const attempt = await this.teacherAttempt(id, user); if (attempt.status !== ExerciseAttemptStatus.SUBMITTED) throw new BadRequestException("Attempt has not been submitted"); const version = await this.versions.findById(attempt.exerciseVersionId); const maximum = version?.questions.filter((question) => question.type === ExerciseQuestionType.READ_ALOUD).reduce((sum, question) => sum + question.points, 0) ?? 0; if (manualPoints > maximum) throw new BadRequestException(`Manual points cannot exceed ${maximum}`); attempt.manualPoints = manualPoints; attempt.gradingStatus = ExerciseGradingStatus.READY_TO_PUBLISH; return attempt.save(); }
  async publishResult(id: string, user: JwtPrincipal) { const attempt = await this.teacherAttempt(id, user); if (attempt.gradingStatus !== ExerciseGradingStatus.READY_TO_PUBLISH) throw new BadRequestException("Finish manual grading before publishing"); attempt.gradingStatus = ExerciseGradingStatus.PUBLISHED; await attempt.save(); return { id: attempt.id, gradingStatus: attempt.gradingStatus, totalPoints: attempt.autoPoints + (attempt.manualPoints ?? 0) }; }
  async result(id: string, user: JwtPrincipal) { const attempt = await this.studentAttempt(id, user); if (attempt.gradingStatus !== ExerciseGradingStatus.PUBLISHED) return { id: attempt.id, status: attempt.status, gradingStatus: attempt.gradingStatus }; const version = await this.versions.findById(attempt.exerciseVersionId); const assignment = await this.assignments.findById(attempt.assignmentId); return { id: attempt.id, gradingStatus: attempt.gradingStatus, autoPoints: attempt.autoPoints, manualPoints: attempt.manualPoints ?? 0, totalPoints: attempt.autoPoints + (attempt.manualPoints ?? 0), questionScores: attempt.questionScores, questions: assignment?.allowAnswerReview ? version?.questions.map((question) => ({ id: question.id, answerKey: question.answerKey, explanation: question.explanation })) : undefined }; }

  async uploadCourseAsset(courseId: string, file: Express.Multer.File, user: JwtPrincipal) {
    if (!file) throw new BadRequestException("Choose an image");
    const course = await this.courses.findById(asId(courseId));
    if (!course) throw new NotFoundException("Course not found");
    if (user.role !== Role.ADMIN && (user.role !== Role.TEACHER || course.teacherId.toString() !== user.sub)) throw new ForbiddenException();
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const mime = file.mimetype.split(";", 1)[0].toLowerCase();
    if (!allowed.has(mime) || file.size > 15 * 1024 * 1024 || !await hasExpectedSignature(file.path, mime)) { await unlink(file.path).catch(() => undefined); throw new BadRequestException("Use a valid JPEG, PNG or WebP image up to 15 MB"); }
    file.mimetype = mime;
    const stored = await this.storage.store(file, { courseName: course.name, assignmentName: "ExerciseAssets", studentName: "Teacher", teacherEmail: undefined });
    try { return await this.assets.create({ courseId: course._id, ownerId: asId(user.sub), kind: "IMAGE", ...stored, scanStatus: "CLEAN" }); }
    catch (error) { await this.storage.remove(stored.storageKey); throw error; }
  }
  async uploadAudio(attemptId: string, questionId: string, durationSeconds: number, file: Express.Multer.File, user: JwtPrincipal) {
    if (!file) throw new BadRequestException("Choose an audio recording");
    const attempt = await this.studentAttempt(attemptId, user);
    if (attempt.status !== ExerciseAttemptStatus.IN_PROGRESS) throw new ConflictException("Submitted attempts cannot be changed");
    const version = await this.versions.findById(attempt.exerciseVersionId);
    const question = version?.questions.find((item) => item.id === questionId);
    if (!question || question.type !== ExerciseQuestionType.READ_ALOUD) throw new BadRequestException("Question is not a read-aloud question");
    const maxDuration = typeof question.content.maxDurationSeconds === "number" ? Math.min(question.content.maxDurationSeconds, 120) : 120;
    const allowed = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"]);
    const mime = file.mimetype.split(";", 1)[0].toLowerCase();
    if (!allowed.has(mime) || !await hasExpectedSignature(file.path, mime) || file.size > 15 * 1024 * 1024 || !Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > maxDuration) { await unlink(file.path).catch(() => undefined); throw new BadRequestException(`Recording must be valid audio, 3–${maxDuration} seconds and at most 15 MB`); }
    file.mimetype = mime;
    const course = await this.courses.findById(attempt.courseId);
    const assignment = await this.assignments.findById(attempt.assignmentId);
    const stored = await this.storage.store(file, { courseName: course?.name ?? attempt.courseId.toString(), assignmentName: assignment?.title ?? attempt.assignmentId.toString(), studentName: user.sub });
    let asset: ExerciseAssetDocument;
    try { asset = await this.assets.create({ courseId: attempt.courseId, ownerId: attempt.studentId, kind: "AUDIO", attemptId: attempt._id, questionId, durationSeconds, ...stored, scanStatus: "CLEAN" }); }
    catch (error) { await this.storage.remove(stored.storageKey); throw error; }
    const previous = attempt.answers.find((answer) => answer.questionId === questionId);
    if (previous?.payload.audioAssetId) { const old = await this.assets.findOne({ _id: previous.payload.audioAssetId, attemptId: attempt._id }); if (old) { await this.storage.remove(old.storageKey); await old.deleteOne(); } }
    const nextAnswer: ExerciseAnswer = { questionId, payload: { audioAssetId: asset.id, durationSeconds } };
    attempt.answers = [...attempt.answers.filter((answer) => answer.questionId !== questionId), nextAnswer];
    attempt.revision += 1; attempt.lastSavedAt = new Date(); await attempt.save();
    return { assetId: asset.id, durationSeconds, revision: attempt.revision, lastSavedAt: attempt.lastSavedAt };
  }
  async openAsset(id: string, user: JwtPrincipal) {
    const asset = await this.assets.findById(asId(id));
    if (!asset || asset.scanStatus !== "CLEAN") throw new NotFoundException("Asset not found");
    if (user.role === Role.STUDENT) {
      const enrolled = await this.enrollments.exists({ courseId: asset.courseId, studentId: asId(user.sub), active: true });
      if (!enrolled || (asset.kind === "AUDIO" && asset.ownerId.toString() !== user.sub)) throw new ForbiddenException();
    } else {
      const course = await this.courses.findById(asset.courseId);
      if (user.role !== Role.ADMIN && (user.role !== Role.TEACHER || course?.teacherId.toString() !== user.sub)) throw new ForbiddenException();
    }
    return { asset, opened: await this.storage.open(asset.storageKey, asset.mime) };
  }
}

async function hasExpectedSignature(path: string, mime: string) {
  const bytes = (await readFile(path)).subarray(0, 16);
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (mime === "audio/webm") return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === "audio/mp4") return bytes.subarray(4, 8).toString() === "ftyp";
  if (mime === "audio/ogg") return bytes.subarray(0, 4).toString() === "OggS";
  if (mime === "audio/wav" || mime === "audio/x-wav") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE";
  if (mime === "audio/mpeg") return bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return false;
}

