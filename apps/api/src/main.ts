import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { RabbitTransport } from './shared/messaging/rabbit-transport.js';

const envFile = new URL('../../../.env', import.meta.url); // dist/main.js → repo root
if (existsSync(envFile)) process.loadEnvFile(envFile);

// One JSON object per line on servers, readable coloured lines in dev.
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
});
app.enableShutdownHooks();
app.connectMicroservice({ strategy: new RabbitTransport() }, { inheritAppConfig: true });
await app.startAllMicroservices();
await app.listen(process.env.PORT ?? 3000);
