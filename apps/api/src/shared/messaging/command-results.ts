import { UnprocessableEntityException } from '@nestjs/common';

/**
 * A business rule forbids the change (coding standard 8). In command work it becomes
 * event.<module>.command.rejected; in an HTTP request it becomes a 422 response.
 */
export class CommandRejected extends UnprocessableEntityException {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Payload of event.<module>.command.completed; result is null when the work returned nothing. */
export type CommandCompleted = { command: string; commandId: string; result: unknown };

/** Payload of event.<module>.command.rejected. */
export type CommandRejection = { command: string; commandId: string; reason: string };
