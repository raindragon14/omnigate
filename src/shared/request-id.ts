import { randomUUID } from "crypto";

/** Response header carrying the per-request correlation id. */
export const REQUEST_ID_HEADER_NAME = "x-request-id";

/**
 * Generates a unique correlation id for one incoming request.
 * Returned to clients via the x-request-id response header; never used as a
 * metric label.
 * @returns A UUID v4 string.
 */
export function createRequestId(): string {
  return randomUUID();
}
