import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AmqpConnectionManagerClass } from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { DB } from '../database/database.module.js';
import type { Db, Tx } from '../database/database.module.js';
import type { Envelope, Message } from './envelope.js';

export const EVENTS_EXCHANGE = 'erp.events';
export const COMMANDS_EXCHANGE = 'erp.commands';

/** Coding standard 5.1: the routing-key prefix picks the exchange. */
export function exchangeFor(topic: string): string {
  if (topic.startsWith('event.')) return EVENTS_EXCHANGE;
  if (topic.startsWith('cmd.')) return COMMANDS_EXCHANGE;
  throw new Error(`routing key must start with "event." or "cmd.": ${topic}`);
}

@Injectable()
export class MessageBus implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MessageBus.name);
  private readonly pending = new WeakMap<Tx, Envelope<unknown>[]>();
  private readonly connection: AmqpConnectionManager;
  private readonly channel: ChannelWrapper;

  constructor(@Inject(DB) private readonly db: Db) {
    const url = process.env.RABBITMQ_URL;
    if (!url) throw new Error('RABBITMQ_URL is not set');
    this.connection = new AmqpConnectionManagerClass(url);
    this.channel = this.connection.createChannel({
      name: 'publisher',
      confirm: true,
      publishTimeout: 10_000,
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
        await channel.assertExchange(COMMANDS_EXCHANGE, 'topic', { durable: true });
      },
    });
  }

  async onModuleInit() {
    await this.connection.connect({ timeout: 10_000 }); // fail fast if RabbitMQ is unreachable
    await this.channel.waitForConnect();
  }

  async onApplicationShutdown() {
    await this.channel.close();
    await this.connection.close();
  }

  /** Runs work in a transaction; messages added with bus.add are sent after it commits. */
  async transaction<R>(work: (tx: Tx) => Promise<R>): Promise<R> {
    const outgoing: Envelope<unknown>[] = [];
    const result = await this.db.transaction(async (tx) => {
      this.pending.set(tx, outgoing);
      return work(tx);
    });
    await Promise.all(outgoing.map((env) => this.send(env).catch((error: unknown) => this.logLost(env, error))));
    return result;
  }

  add<T>(tx: Tx, message: Message<T>): void {
    const outgoing = this.pending.get(tx);
    if (!outgoing) throw new Error('bus.add needs a tx from bus.transaction or MessageConsumer');
    outgoing.push(this.envelope(message));
  }

  /** Only when there is no write to pair with, and never while a transaction is open. */
  publish<T>(message: Message<T>): Promise<void> {
    return this.send(this.envelope(message));
  }

  private envelope<T>(message: Message<T>): Envelope<T> {
    exchangeFor(message.topic); // reject a bad prefix before anything commits
    return { ...message, id: message.id ?? randomUUID(), occurredAt: new Date().toISOString() };
  }

  private async send(env: Envelope<unknown>): Promise<void> {
    await this.channel.publish(exchangeFor(env.topic), env.topic, Buffer.from(JSON.stringify(env)), {
      persistent: true,
      messageId: env.id,
      contentType: 'application/json',
    });
  }

  private logLost(env: Envelope<unknown>, error: unknown) {
    this.logger.error(
      `message lost after commit: ${JSON.stringify(env)}`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
