export class LlmError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LlmError";
  }
}

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
