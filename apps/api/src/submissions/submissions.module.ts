import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Assignment, AssignmentSchema } from '../assignments/assignment.schema';
import { Course, CourseSchema } from '../courses/course.schema';
import { Enrollment, EnrollmentSchema } from '../courses/enrollment.schema';
import { User, UserSchema } from '../users/user.schema';
import { Submission, SubmissionSchema } from './submission.schema';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Submission.name, schema: SubmissionSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
