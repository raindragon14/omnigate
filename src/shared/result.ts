import type { Result } from "./signatures";

/** Wraps a value in a successful Result. */
export function createOkResult<TValue>(value: TValue): Result<TValue> {
  return {
    isOk: true,
    value,
  };
}

/** Wraps an error in a failed Result. */
export function createErrorResult<TValue, TError>(error: TError): Result<TValue, TError> {
  return {
    isOk: false,
    error,
  };
}
