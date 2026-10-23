import base from '@erp/config/eslint';

const QUERIES_ONLY = '@nestjs/cqrs is for queries only (coding standard 5.1); commands and events go through RabbitMQ.';

export default [
  ...base,
  {
    // Nest injects constructor parameters by their runtime class, so those imports must stay value imports.
    languageOptions: { parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/cqrs',
              importNames: [
                'CommandBus',
                'EventBus',
                'CommandHandler',
                'EventsHandler',
                'Saga',
                'ofType',
                'Command',
                'ICommand',
                'ICommandHandler',
                'IEvent',
                'IEventHandler',
                'AggregateRoot',
                'EventPublisher',
              ],
              message: QUERIES_ONLY,
            },
            { name: '@nestjs/workflows/cqrs', message: QUERIES_ONLY },
          ],
        },
      ],
    },
  },
];
