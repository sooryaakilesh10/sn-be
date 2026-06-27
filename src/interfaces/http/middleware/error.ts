import { AppError } from "../../../shared/errors.js";
import { json } from "../response.js";

// Converts any thrown value into a safe JSON error response. AppErrors map to
// their status; anything else is a masked 500 (no internals leak to clients).
export function toErrorResponse(err: unknown, requestId: string, isProduction: boolean): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    const retryAfter = (err as AppError & { retryAfter?: number }).retryAfter;
    if (typeof retryAfter === "number") headers["retry-after"] = String(retryAfter);
    return json(
      {
        error: { code: err.code, message: err.message, details: err.details ?? undefined },
        requestId,
      },
      { status: err.status, headers },
    );
  }

  // Unexpected — log for observability, return an opaque 500.
  console.error(`[${requestId}] Unhandled error:`, err);
  return json(
    {
      error: {
        code: "INTERNAL",
        message: isProduction ? "Internal server error" : String((err as Error)?.message ?? err),
      },
      requestId,
    },
    { status: 500 },
  );
}
