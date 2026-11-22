import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
import { CourseStatus } from "../common/domain.js";
@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true, unique: true, index: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: "" }) description: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true })
  teacherId: Types.ObjectId;
  @Prop({ enum: CourseStatus, default: CourseStatus.DRAFT })
  status: CourseStatus;
  @Prop() startsAt?: Date;
  @Prop() endsAt?: Date;
  @Prop() archivedAt?: Date;
}
export type CourseDocument = HydratedDocument<Course>;
export const CourseSchema = SchemaFactory.createForClass(Course);
