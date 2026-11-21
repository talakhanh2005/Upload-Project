import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
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
  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  createdBy: Types.ObjectId;
}
export type AssignmentDocument = HydratedDocument<Assignment>;
export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
