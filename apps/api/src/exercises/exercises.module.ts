import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Assignment, AssignmentSchema } from "../assignments/assignment.schema.js";
import { AuthModule } from "../auth/auth.module.js";
import { Course, CourseSchema } from "../courses/course.schema.js";
import { Enrollment, EnrollmentSchema } from "../courses/enrollment.schema.js";
import { User, UserSchema } from "../users/user.schema.js";
import { ExerciseAttempt, ExerciseAttemptSchema } from "./exercise-attempt.schema.js";
import { ExerciseAsset, ExerciseAssetSchema } from "./exercise-asset.schema.js";
import { ExerciseVersion, ExerciseVersionSchema } from "./exercise-version.schema.js";
import { ExercisesController } from "./exercises.controller.js";
import { ExercisesService } from "./exercises.service.js";

@Module({
  imports: [AuthModule, MongooseModule.forFeature([
    { name: Assignment.name, schema: AssignmentSchema }, { name: Course.name, schema: CourseSchema }, { name: Enrollment.name, schema: EnrollmentSchema },
    { name: User.name, schema: UserSchema }, { name: ExerciseVersion.name, schema: ExerciseVersionSchema }, { name: ExerciseAttempt.name, schema: ExerciseAttemptSchema }, { name: ExerciseAsset.name, schema: ExerciseAssetSchema },
  ])],
  controllers: [ExercisesController], providers: [ExercisesService], exports: [ExercisesService],
})
export class ExercisesModule {}

