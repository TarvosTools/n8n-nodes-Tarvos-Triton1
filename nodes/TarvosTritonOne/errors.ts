import type { IDataObject } from "n8n-workflow";

export class TritonError extends Error {
  constructor(
    public code: string,
    message: string,
    public stop = false,
    public details: IDataObject = {},
  ) {
    super(message);
    this.name = "TritonError";
  }
}
export function safeError(error: unknown): TritonError {
  return error instanceof TritonError
    ? error
    : new TritonError(
        "INTERNAL_ERROR",
        "Unable to complete the operation. Check the configured fields and supported transaction format.",
      );
}
