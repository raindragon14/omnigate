import type { Result } from "../../docs/codebase-signatures";

export function createOkResult<TValue>(value: TValue): Result<TValue> {
  return {
    isOk: true,
    value,
  };
}

export function createErrorResult<TValue, TError>(error: TError): Result<TValue, TError> {
  return {
    isOk: false,
    error,
  };
}
