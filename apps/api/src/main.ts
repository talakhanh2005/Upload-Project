import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import { AppModule } from './app.module';

async function bootstrap() {
  mkdirSync(process.env.LOCAL_STORAGE_ROOT ?? './uploads', { recursive: true });
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = new DocumentBuilder().setTitle('Course Submission API').setVersion('0.1').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
