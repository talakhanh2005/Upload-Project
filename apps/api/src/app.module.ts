import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { SubmissionsModule } from './submissions/submissions.module.js';
import { HealthController } from './health.controller.js';
import { StorageModule } from './storage/storage.module.js';
import { StudentsModule } from './students/students.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    MongooseModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (c: ConfigService) => ({ uri: c.get('MONGODB_URI', 'mongodb://localhost:27017/course_submission') }) }),
    StorageModule, AuthModule, CoursesModule, AssignmentsModule, SubmissionsModule, StudentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
