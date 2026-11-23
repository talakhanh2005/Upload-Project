import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
import { AssignmentKind, EditorStatus } from "../common/domain.js";
@Schema({ timestamps: true })
export class Assignment {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true })
  courseId: Types.ObjectId;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: "" }) instructions: string;
  @Prop() opensAt?: Date;
  @Prop({ required: true, index: true }) deadlineAt: Date;
  @Prop() closesAt?: Date;
  @Prop({ default: false }) isManuallyLocked: boolean;
  @Prop({ default: false }) deleted: boolean;
  @Prop({ default: 25 }) maxFileCount: number;
  @Prop({ default: 26214400 }) maxFileBytes: number;
  @Prop({ default: 104857600 }) maxTotalBytes: number;
  @Prop({ enum: AssignmentKind, default: AssignmentKind.FILE_UPLOAD, index: true })
  kind: AssignmentKind;
  @Prop({ enum: EditorStatus }) editorStatus?: EditorStatus;
  @Prop({ type: MongoSchema.Types.ObjectId }) activeExerciseVersionId?: Types.ObjectId;
  @Prop({ default: 1, min: 1, max: 10 }) maxAttempts: number;
  @Prop({ default: "AFTER_PUBLISH" }) showResultsPolicy: "AFTER_PUBLISH";
  @Prop({ default: true }) allowAnswerReview: boolean;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  createdBy: Types.ObjectId;
}
export type AssignmentDocument = HydratedDocument<Assignment>;
export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
