import type { Result } from "./signatures";

/**
 * Wraps a value in a successful Result.
 * @template TValue  The type of the value to wrap.
 * @param value  The value to wrap.
 * @returns A Result in the "ok" state.
 */
export function createOkResult<TValue>(value: TValue): Result<TValue> {
  return {
    isOk: true,
    value,
  };
}

/**
 * Wraps an error in a failed Result.
 * @template TValue  The type of the value (unused in failure state).
 * @template TError  The type of the error.
 * @param error  The error to wrap.
 * @returns A Result in the "error" state.
 */
export function createErrorResult<TValue, TError>(error: TError): Result<TValue, TError> {
  return {
    isOk: false,
    error,
  };
}
