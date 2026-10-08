import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 4000;

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(Number(process.env.API_PORT ?? DEFAULT_PORT));
