export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "DATA_INVALID";

const RETRYABLE_CODES = new Set<ErrorCode>([
  "RATE_LIMITED",
  "TIMEOUT",
  "PROVIDER_UNAVAILABLE",
]);

/** 统一错误契约（specs/tools/error.schema.json）的运行时载体。 */
export class ToolError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;
  requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    this.details = details;
  }

  toJSON(): {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    request_id: string | null;
    details: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      request_id: this.requestId ?? null,
      details: this.details,
    };
  }
}

export function invalidArgument(message: string, details: Record<string, unknown> = {}): ToolError {
  return new ToolError("INVALID_ARGUMENT", message, details);
}

export function notFound(message: string, details: Record<string, unknown> = {}): ToolError {
  return new ToolError("NOT_FOUND", message, details);
}

export function conflict(message: string, details: Record<string, unknown> = {}): ToolError {
  return new ToolError("CONFLICT", message, details);
}

export function dataInvalid(message: string, details: Record<string, unknown> = {}): ToolError {
  return new ToolError("DATA_INVALID", message, details);
}
