// Module boundary rules from the backend coding standard, section 4.
const CONTRACT = '^src/modules/[^/]+/contracts/index\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'module-only-via-contracts',
      comment: 'A module may import another module only through its contracts/index.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', CONTRACT] },
    },
    {
      name: 'outside-only-via-contracts',
      comment: 'Code outside modules imports only contracts/index.ts (app.module.ts registers modules).',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/modules/', '^src/app\\.module\\.ts$'] },
      to: { path: '^src/modules/', pathNot: CONTRACT },
    },
    {
      name: 'workflows-only-contracts-and-shared',
      comment: 'Workflows import only contracts and shared/.',
      severity: 'error',
      from: { path: '^src/workflows/' },
      to: { path: '^src/', pathNot: ['^src/workflows/', '^src/shared/', CONTRACT] },
    },
    {
      name: 'shared-imports-no-module',
      comment: 'shared/ imports no module or workflow.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|workflows)/' },
    },
    {
      name: 'command-sender-only-in-workflows',
      comment: 'CommandSender is reserved for workflows; modules send commands with bus.add (standard 6.1).',
      severity: 'error',
      from: { pathNot: ['^src/workflows/', '^src/shared/workflow/'] },
      to: { path: '^src/shared/workflow/command-sender\\.ts$' },
    },
    {
      name: 'contracts-only-cqrs',
      comment: 'Contracts import nothing except @nestjs/cqrs.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/contracts/' },
      to: { pathNot: 'node_modules/@nestjs/cqrs/' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};
