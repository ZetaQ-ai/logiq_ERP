// Message shapes shared by every module (coding standard 6.1).

export type Meta = { correlationId: string; causationId?: string };

/** What a module passes to bus.add / bus.publish. Leave id unset unless the message can repeat. */
export type Message<T> = { topic: string; key: string; payload: T; headers: Meta; id?: string };

/** What travels on RabbitMQ. occurredAt is ISO-8601. */
export type Envelope<T> = Message<T> & { id: string; occurredAt: string };

export const headersOf = (meta: Meta): Meta => ({ ...meta });
