export type ErrorCode = 'invalid' | 'unsupported-schema' | 'missing' | 'duplicate' |
  'conflict' | 'io' | 'cancelled' | 'disposed' | 'wrong-kind';

export class FoundationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context: { path?: string; recoveryPath?: string; cause?: unknown } = {},
  ) { super(message); this.name = 'FoundationError'; }
}

export function checkActive(signal?: AbortSignal, disposed = false): void {
  if (disposed) throw new FoundationError('disposed', 'This service is closed. Reopen MNEMOTOAD.');
  if (signal?.aborted) throw new FoundationError('cancelled', 'Operation cancelled; check the file before retrying any submitted write.');
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
