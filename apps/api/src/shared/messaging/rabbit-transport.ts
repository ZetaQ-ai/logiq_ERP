import { Logger } from '@nestjs/common';
import { Server } from '@nestjs/microservices';
import type { CustomTransportStrategy, MessageHandler } from '@nestjs/microservices';
import { AmqpConnectionManagerClass } from 'amqp-connection-manager';
import type { AmqpConnectionManager, Channel, ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import { lastValueFrom } from 'rxjs';
import { COMMANDS_EXCHANGE, EVENTS_EXCHANGE, exchangeFor } from './message-bus.js';

/** What a listener receives through @Ctx(). */
export type MessageContext = { queue: string; routingKey: string };

/** The @EventPattern extras naming the queue a handler consumes from. */
export const rabbitQueue = (queue: string) => ({ queue });

type Route = { pattern: string; matches: RegExp; handler: MessageHandler };

const PREFETCH = 10;

/** RabbitMQ topic match: `*` is one word, `#` is any number of words. */
function topicRegExp(pattern: string): RegExp {
  const words = pattern
    .split('.')
    .map((w) => (w === '*' ? '[^.]+' : w === '#' ? '.*' : w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^${words.join('\\.')}$`);
}

/**
 * Consumes every queue named by a rabbitQueue(...) on an @EventPattern. Creates each queue (quorum)
 * with its <queue>.dlq, binds it by routing-key prefix, acks when the handler succeeds and sends the
 * message to <queue>.dlq when it throws. Nothing is retried automatically (coding standard 6.2).
 */
export class RabbitTransport extends Server implements CustomTransportStrategy {
  override readonly propagatesEventHandlerErrors = true; // Nest swallows handler errors otherwise
  protected override readonly logger = new Logger(RabbitTransport.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  async listen(callback: (error?: unknown) => void) {
    try {
      const queues = this.routesByQueue();
      const url = process.env.RABBITMQ_URL;
      if (!url) throw new Error('RABBITMQ_URL is not set');
      this.connection = new AmqpConnectionManagerClass(url);
      this.channel = this.connection.createChannel({
        name: 'consumer',
        // Runs again after every reconnect.
        setup: async (channel: Channel) => {
          await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
          await channel.assertExchange(COMMANDS_EXCHANGE, 'topic', { durable: true });
          await channel.prefetch(PREFETCH);
          for (const [queue, routes] of queues) {
            await channel.assertQueue(`${queue}.dlq`, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
            await channel.assertQueue(queue, {
              durable: true,
              arguments: {
                'x-queue-type': 'quorum',
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': `${queue}.dlq`,
              },
            });
            for (const { pattern } of routes) await channel.bindQueue(queue, exchangeFor(pattern), pattern);
            await channel.consume(queue, (msg) => {
              if (msg) this.handle(channel, queue, routes, msg).catch((error: unknown) => this.logger.error(error));
            });
          }
        },
      });
      await this.connection.connect({ timeout: 10_000 });
      await this.channel.waitForConnect();
      callback();
    } catch (error) {
      callback(error);
    }
  }

  async close() {
    await this.channel?.close();
    await this.connection?.close();
  }

  on(): never {
    throw new Error('RabbitTransport does not emit events');
  }

  unwrap<T>(): T {
    return this.connection as T;
  }

  private async handle(channel: Channel, queue: string, routes: Route[], msg: ConsumeMessage) {
    const routingKey = msg.fields.routingKey;
    try {
      const route = routes.find((r) => r.matches.test(routingKey));
      if (!route) throw new Error('no handler for this routing key');
      const env: unknown = JSON.parse(msg.content.toString());
      const ctx: MessageContext = { queue, routingKey };
      await lastValueFrom(this.transformToObservable(await route.handler(env, ctx)), { defaultValue: undefined });
      channel.ack(msg);
    } catch (error) {
      // A handler's own error is logged with its stack by Nest's RpcExceptionsHandler just before this line.
      const reason = error instanceof Error ? error.message : 'the handler threw';
      this.logger.error(
        `${queue} ${routingKey} ${String(msg.properties.messageId)} moved to ${queue}.dlq: ${reason}`,
        error instanceof Error ? error.stack : undefined,
      );
      channel.nack(msg, false, false);
    }
  }

  /** Groups every @EventPattern by its queue and checks it against coding standard 5.1. */
  private routesByQueue(): Map<string, Route[]> {
    const queues = new Map<string, Route[]>();
    for (const [pattern, head] of this.messageHandlers) {
      let handler: MessageHandler | undefined = head;
      while (handler) {
        const next = handler.next as MessageHandler | undefined;
        handler.next = undefined; // otherwise Nest runs every queue's handler for this pattern
        const queue: unknown = handler.extras?.queue;
        if (!handler.isEventHandler) throw new Error(`${pattern}: listeners use @EventPattern, never @MessagePattern`);
        if (typeof queue !== 'string') throw new Error(`${pattern}: @EventPattern needs rabbitQueue(QUEUE)`);
        exchangeFor(pattern); // rejects an unknown prefix
        if (queue.endsWith('.commands') !== pattern.startsWith('cmd.')) {
          throw new Error(`${pattern} cannot be consumed from ${queue}: cmd. keys belong to <module>.commands only`);
        }
        const routes = queues.get(queue) ?? [];
        routes.push({ pattern, matches: topicRegExp(pattern), handler });
        queues.set(queue, routes);
        handler = next;
      }
    }
    return queues;
  }
}
