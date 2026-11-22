import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { Assignment, AssignmentSchema } from '../assignments/assignment.schema.js';
import { Course, CourseSchema } from '../courses/course.schema.js';
import { Enrollment, EnrollmentSchema } from '../courses/enrollment.schema.js';
import { User, UserSchema } from '../users/user.schema.js';
import { Submission, SubmissionSchema } from './submission.schema.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsService } from './submissions.service.js';

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
