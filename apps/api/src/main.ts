import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { RabbitTransport } from './shared/messaging/rabbit-transport.js';

const envFile = new URL('../../../.env', import.meta.url); // dist/main.js → repo root
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
app.connectMicroservice({ strategy: new RabbitTransport() }, { inheritAppConfig: true });
await app.startAllMicroservices();
await app.listen(process.env.PORT ?? 3000);
