import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongoSchema, Types } from "mongoose";
import { Role } from "../common/domain.js";
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: Role, required: true, index: true }) role: Role;
  @Prop({ lowercase: true, trim: true, sparse: true, unique: true })
  email?: string;
  @Prop({ select: false }) credentialHash?: string;
  @Prop({ sparse: true, unique: true, select: false }) studentCode?: string;
  @Prop({ trim: true, maxlength: 500 }) description?: string;
  @Prop({ type: MongoSchema.Types.ObjectId, index: true })
  createdByTeacherId?: Types.ObjectId;
  @Prop({ default: true }) active: boolean;
  @Prop({ index: true }) deletedAt?: Date;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
