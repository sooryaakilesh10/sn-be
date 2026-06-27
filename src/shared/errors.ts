// Typed application errors. The HTTP error middleware maps these to status
// codes, so use cases stay transport-agnostic and never touch `Response`.

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "VALIDATION"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static badRequest(msg = "Bad request", details?: unknown) {
    return new AppError("BAD_REQUEST", msg, details);
  }
  static unauthorized(msg = "Authentication required") {
    return new AppError("UNAUTHORIZED", msg);
  }
  static forbidden(msg = "Not allowed") {
    return new AppError("FORBIDDEN", msg);
  }
  static notFound(msg = "Not found") {
    return new AppError("NOT_FOUND", msg);
  }
  static conflict(msg = "Conflict") {
    return new AppError("CONFLICT", msg);
  }
  static validation(msg: string, details?: unknown) {
    return new AppError("VALIDATION", msg, details);
  }
  static rateLimited(msg = "Too many requests") {
    return new AppError("RATE_LIMITED", msg);
  }
}
