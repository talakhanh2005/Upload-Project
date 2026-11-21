import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
import { FeedbackStatus, ScanStatus } from "../common/domain";
@Schema({ _id: false })
export class SubmissionFile {
  @Prop({ required: true }) storageKey: string;
  @Prop({ required: true }) filename: string;
  @Prop({ required: true }) mime: string;
  @Prop({ required: true }) sizeBytes: number;
  @Prop({ enum: ScanStatus, default: ScanStatus.PENDING })
  scanStatus: ScanStatus;
}
const SubmissionFileSchema = SchemaFactory.createForClass(SubmissionFile);
@Schema({ timestamps: true })
export class Submission {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true })
  assignmentId: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true })
  studentId: Types.ObjectId;
  @Prop({ required: true }) submittedAt: Date;
  @Prop({ enum: ["SUBMITTED", "LATE"], required: true }) status:
    "SUBMITTED" | "LATE";
  @Prop({ type: [SubmissionFileSchema], default: [] }) files: SubmissionFile[];
  @Prop() reviewedAt?: Date;
  @Prop({ default: "" }) feedbackText: string;
  @Prop({ enum: FeedbackStatus, default: FeedbackStatus.NONE })
  feedbackStatus: FeedbackStatus;
  @Prop() feedbackPublishedAt?: Date;
}
export type SubmissionDocument = HydratedDocument<Submission>;
export const SubmissionSchema = SchemaFactory.createForClass(Submission);
SubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
