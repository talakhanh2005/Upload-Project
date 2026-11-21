import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
@Schema({ timestamps: true })
export class Enrollment {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true })
  courseId: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true })
  studentId: Types.ObjectId;
  @Prop({ default: true }) active: boolean;
  @Prop({ default: false }) suspendedByStudentDeletion: boolean;
}
export type EnrollmentDocument = HydratedDocument<Enrollment>;
export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
EnrollmentSchema.index({ courseId: 1, studentId: 1 }, { unique: true });
