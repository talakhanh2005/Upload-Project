import { Module } from '@nestjs/common'; import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module'; import { Course, CourseSchema } from './course.schema'; import { Enrollment, EnrollmentSchema } from './enrollment.schema';
import { User, UserSchema } from '../users/user.schema';
import { CoursesController } from './courses.controller'; import { CoursesService } from './courses.service';
@Module({ imports: [AuthModule, MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }, { name: Enrollment.name, schema: EnrollmentSchema }, { name: User.name, schema: UserSchema }])], controllers: [CoursesController], providers: [CoursesService], exports: [MongooseModule] })
export class CoursesModule {}
