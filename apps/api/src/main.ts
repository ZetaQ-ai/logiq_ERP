import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const envFile = new URL('../../../.env', import.meta.url); // dist/main.js → repo root
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(process.env.PORT ?? 3000);
