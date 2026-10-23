import { WorkflowSignal } from '@nestjs/workflows';
import type { Duration, WorkflowContext } from '@nestjs/workflows';
import type { CommandSender } from './command-sender.js';

/** A module's answer to a workflow's command, delivered by WorkflowResults. */
export type CommandOutcome = { status: 'completed'; result: unknown } | { status: 'rejected'; reason: string };
export const COMMAND_RESULT = new WorkflowSignal<CommandOutcome>('command.result');

/** The command that undoes a completed one (coding standard 7.3). */
export type Undo = { topic: string; payload: unknown };

const ATTEMPTS = 3;

/**
 * Sends a command and waits for its result (coding standard 7.1). On timeout it resends with the same
 * command id, up to three attempts, then fails. A rejection fails the workflow, which runs the
 * compensations of earlier steps in reverse. `undo` is registered only once the command completed.
 */
export async function sendCommand<R>(
  ctx: WorkflowContext,
  sender: CommandSender,
  name: string,
  topic: string,
  payload: unknown,
  { timeout = '5m', undo }: { timeout?: Duration; undo?: (result: R) => Undo } = {},
): Promise<R> {
  const send = (id: string) => sender.send(topic, payload, { id, correlationId: ctx.workflowId });
  const commandId = await ctx.step(name, ({ idempotencyKey }) => send(idempotencyKey));

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const outcome = await ctx.waitForSignal(`${name}.result-${attempt}`, COMMAND_RESULT, { key: commandId, timeout });
    if (outcome?.status === 'rejected') ctx.fail(outcome.reason);
    if (outcome?.status === 'completed') {
      const result = outcome.result as R;
      if (undo) {
        await ctx.step(`${name}.done`, () => undo(result), {
          compensate: (spec, { idempotencyKey }) =>
            sender.send(spec.topic, spec.payload, { id: idempotencyKey, correlationId: ctx.workflowId }),
        });
      }
      return result;
    }
    if (attempt < ATTEMPTS) await ctx.step(`${name}.resend-${attempt}`, () => send(commandId));
  }
  ctx.fail(`${topic} got no result after ${ATTEMPTS} attempts`);
}
