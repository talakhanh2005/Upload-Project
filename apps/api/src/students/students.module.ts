import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { Course, CourseSchema } from "../courses/course.schema";
import { Enrollment, EnrollmentSchema } from "../courses/enrollment.schema";
import { Submission, SubmissionSchema } from "../submissions/submission.schema";
import { User, UserSchema } from "../users/user.schema";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
