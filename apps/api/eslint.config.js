import base from '@erp/config/eslint';

export default [
  ...base,
  {
    // Nest injects constructor parameters by their runtime class, so those imports must stay value imports.
    languageOptions: { parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true } },
  },
];
