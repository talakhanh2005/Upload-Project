import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";

@Schema({ timestamps: true, collection: "exercise_assets" })
export class ExerciseAsset {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) courseId: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) ownerId: Types.ObjectId;
  @Prop({ enum: ["IMAGE", "AUDIO"], required: true }) kind: "IMAGE" | "AUDIO";
  @Prop({ type: MongoSchema.Types.ObjectId, index: true }) attemptId?: Types.ObjectId;
  @Prop() questionId?: string;
  @Prop({ required: true }) storageKey: string;
  @Prop({ required: true }) filename: string;
  @Prop({ required: true }) mime: string;
  @Prop({ required: true }) sizeBytes: number;
  @Prop() durationSeconds?: number;
  @Prop({ default: "CLEAN" }) scanStatus: string;
}
export type ExerciseAssetDocument = HydratedDocument<ExerciseAsset>;
export const ExerciseAssetSchema = SchemaFactory.createForClass(ExerciseAsset);
ExerciseAssetSchema.index({ attemptId: 1, questionId: 1 });

