import { Global, Module } from '@nestjs/common';
import { MessageBus } from './message-bus.js';
import { MessageConsumer } from './message-consumer.js';

@Global()
@Module({ providers: [MessageBus, MessageConsumer], exports: [MessageBus, MessageConsumer] })
export class MessagingModule {}
