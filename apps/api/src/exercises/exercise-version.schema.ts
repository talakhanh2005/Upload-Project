import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
import { EditorStatus } from "../common/domain.js";
import type { ExerciseQuestion, ExerciseSection } from "./exercise.types.js";

@Schema({ timestamps: true, collection: "exercise_versions" })
export class ExerciseVersion {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) assignmentId: Types.ObjectId;
  @Prop({ required: true, min: 1 }) versionNumber: number;
  @Prop({ enum: EditorStatus, default: EditorStatus.DRAFT, index: true }) status: EditorStatus;
  @Prop({ type: [MongoSchema.Types.Mixed], default: [] }) sections: ExerciseSection[];
  @Prop({ type: [MongoSchema.Types.Mixed], default: [] }) questions: ExerciseQuestion[];
  @Prop({ default: 0 }) revision: number;
  @Prop() publishedAt?: Date;
  @Prop() contentHash?: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) createdBy: Types.ObjectId;
}
export type ExerciseVersionDocument = HydratedDocument<ExerciseVersion>;
export const ExerciseVersionSchema = SchemaFactory.createForClass(ExerciseVersion);
ExerciseVersionSchema.index({ assignmentId: 1, versionNumber: 1 }, { unique: true });

