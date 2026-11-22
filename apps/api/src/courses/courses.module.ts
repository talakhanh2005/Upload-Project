import { Module } from '@nestjs/common'; import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js'; import { Course, CourseSchema } from './course.schema.js'; import { Enrollment, EnrollmentSchema } from './enrollment.schema.js';
import { User, UserSchema } from '../users/user.schema.js';
import { CoursesController } from './courses.controller.js'; import { CoursesService } from './courses.service.js';
@Module({ imports: [AuthModule, MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }, { name: Enrollment.name, schema: EnrollmentSchema }, { name: User.name, schema: UserSchema }])], controllers: [CoursesController], providers: [CoursesService], exports: [MongooseModule] })
export class CoursesModule {}
