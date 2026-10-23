import { Injectable } from '@nestjs/common';
import { MessageBus } from '../messaging/message-bus.js';

/** Sends a command with a caller-chosen id. Reserved for workflows (coding standard 6.1). */
@Injectable()
export class CommandSender {
  constructor(private readonly bus: MessageBus) {}

  /** Sending the same id again is safe: the receiver runs it once and replays its result. */
  async send(topic: string, payload: unknown, { id, correlationId }: { id: string; correlationId: string }) {
    if (!topic.startsWith('cmd.')) throw new Error(`CommandSender sends commands only, not ${topic}`);
    await this.bus.publish({ id, topic, key: id, payload, headers: { correlationId } });
    return id;
  }
}
