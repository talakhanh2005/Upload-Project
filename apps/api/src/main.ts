import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import * as appModuleExports from './app.module.js';

const AppModule =
  appModuleExports.AppModule ??
  (appModuleExports as typeof appModuleExports & { default?: typeof appModuleExports }).default?.AppModule;

if (!AppModule) {
  throw new Error('Unable to load AppModule');
}

async function bootstrap() {
  const runningInVercelFunction = import.meta.url.startsWith('file:///var/task/');
  const uploadRoot = runningInVercelFunction
    ? '/tmp/uploads'
    : (process.env.LOCAL_STORAGE_ROOT ?? './uploads');
  process.env.LOCAL_STORAGE_ROOT = uploadRoot;
  mkdirSync(uploadRoot, { recursive: true });

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();

