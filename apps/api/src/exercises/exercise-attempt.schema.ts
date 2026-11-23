import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
import { ExerciseAttemptStatus, ExerciseGradingStatus } from "../common/domain.js";
import type { ExerciseAnswer } from "./exercise.types.js";

@Schema({ timestamps: true, collection: "exercise_attempts" })
export class ExerciseAttempt {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) assignmentId: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) exerciseVersionId: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) courseId: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) studentId: Types.ObjectId;
  @Prop({ required: true, min: 1 }) attemptNumber: number;
  @Prop({ enum: ExerciseAttemptStatus, default: ExerciseAttemptStatus.IN_PROGRESS }) status: ExerciseAttemptStatus;
  @Prop({ type: [MongoSchema.Types.Mixed], default: [] }) answers: ExerciseAnswer[];
  @Prop({ type: MongoSchema.Types.Mixed, default: {} }) presentation: Record<string, unknown>;
  @Prop({ default: 0 }) revision: number;
  @Prop({ default: 0 }) autoPoints: number;
  @Prop() manualPoints?: number;
  @Prop({ enum: ExerciseGradingStatus }) gradingStatus?: ExerciseGradingStatus;
  @Prop({ type: [MongoSchema.Types.Mixed], default: [] }) questionScores: Array<{ questionId: string; points: number; maxPoints: number }>;
  @Prop() startedAt: Date;
  @Prop() lastSavedAt?: Date;
  @Prop() submittedAt?: Date;
  @Prop() submissionKey?: string;
}
export type ExerciseAttemptDocument = HydratedDocument<ExerciseAttempt>;
export const ExerciseAttemptSchema = SchemaFactory.createForClass(ExerciseAttempt);
ExerciseAttemptSchema.index({ assignmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
ExerciseAttemptSchema.index({ studentId: 1, assignmentId: 1, status: 1 });

