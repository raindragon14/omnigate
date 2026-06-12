import type { Hono } from "hono";

export type ServiceStatus = "ok" | "degraded";

export type Result<TValue, TError = AppError> =
  | { isOk: true; value: TValue }
  | { isOk: false; error: TError };

export interface AppConfig {
  port: number;
}

export interface HealthResponse {
  status: ServiceStatus;
  service: string;
}

export interface RouterModel {
  id: string;
  object: "model";
  owned_by: string;
}

export interface ModelListResponse {
  object: "list";
  data: RouterModel[];
}

export interface AppError {
  code: string;
  message: string;
  statusCode: number;
}

export declare function createApp(): Hono;
export declare function loadAppConfig(): AppConfig;
export declare function parseAppConfig(environment: Record<string, string | undefined>): AppConfig;
export declare function registerAppErrorHandler(app: Hono): void;
export declare function registerHealthRoute(app: Hono): void;
export declare function registerModelRoute(app: Hono): void;
export declare function getHealthStatus(): HealthResponse;
export declare function listRouterModels(): ModelListResponse;
export declare function createOkResult<TValue>(value: TValue): Result<TValue>;
export declare function createErrorResult<TValue, TError>(error: TError): Result<TValue, TError>;
export declare function createAppError(code: string, message: string, statusCode: number): AppError;
