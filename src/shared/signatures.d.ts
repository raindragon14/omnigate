import type { Hono } from "hono";

/** Service operational status indicator. */
export type ServiceStatus = "ok" | "degraded";

/** Discriminated union returning either a value or an error. */
export type Result<TValue, TError = AppError> =
  | { isOk: true; value: TValue }
  | { isOk: false; error: TError };

/** Application-level runtime configuration. */
export interface AppConfig {
  port: number;
}

/** Response body for the GET /health endpoint. */
export interface HealthResponse {
  status: ServiceStatus;
  service: string;
}

/** A model alias exposed by the router to clients. */
export interface RouterModel {
  id: string;
  object: "model";
  owned_by: string;
}

/** Response body for the GET /v1/models endpoint. */
export interface ModelListResponse {
  object: "list";
  data: RouterModel[];
}

/** Structured error with machine-readable code and HTTP status. */
export interface AppError {
  code: string;
  message: string;
  statusCode: number;
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

/** Creates and configures the Hono application with all feature routes. */
export declare function createApp(): Hono;

/** Loads AppConfig from environment variables (Bun.env). */
export declare function loadAppConfig(): AppConfig;

/** Parses a raw environment record into an AppConfig with port validation. */
export declare function parseAppConfig(environment: Record<string, string | undefined>): AppConfig;

/** Registers global notFound and onError handlers with OpenAI-compatible error shape. */
export declare function registerAppErrorHandler(app: Hono): void;

/** Registers the GET /health route. */
export declare function registerHealthRoute(app: Hono): void;

/** Registers the GET /v1/models route. */
export declare function registerModelRoute(app: Hono): void;

/** Returns the current service health status. */
export declare function getHealthStatus(): HealthResponse;

/** Returns the list of router model aliases. */
export declare function listRouterModels(): ModelListResponse;

/** Wraps a value in a successful Result. */
export declare function createOkResult<TValue>(value: TValue): Result<TValue>;

/** Wraps an error in a failed Result. */
export declare function createErrorResult<TValue, TError>(error: TError): Result<TValue, TError>;

/** Creates an AppError with a code, message, and HTTP status code. */
export declare function createAppError(code: string, message: string, statusCode: number): AppError;

// ---------------------------------------------------------------------------
// Sprint 2 — Chat Completions
// ---------------------------------------------------------------------------

/** A single message in an OpenAI-compatible chat conversation. */
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string | undefined;
  tool_call_id?: string | undefined;
  tool_calls?: unknown[] | undefined;
};

/** Incoming request body for POST /v1/chat/completions (OpenAI-compatible shape). */
export type OpenAIChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  stream?: boolean | undefined;
};

/** Normalised internal representation of a chat completion request. */
export type RouterRequest = {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  topP?: number | undefined;
  stream: boolean;
};

/** A single provider entry from the registry, ready for selection and routing. */
export type ProviderCandidate = {
  id: string;
  baseUrl: string;
  model: string;
  family: string;
  priority: number;
  enabled: boolean;
  paidFallback: boolean;
  apiKeyEnv: string;
};

/** Configuration for a single model alias in the provider registry. */
export type AliasConfig = {
  families: string[];
  allow_paid?: boolean | undefined;
};

/** The complete provider registry loaded from provider.registry.yaml. */
export type ProviderRegistry = {
  providers: ProviderCandidate[];
  aliases: Record<string, AliasConfig>;
};

/** Shape of the HTTP request sent to an upstream provider. */
export type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

/** Shape of the HTTP response received from an upstream provider. */
export type ProviderResponse = {
  status: number;
  body: Record<string, unknown>;
};

/** A standard OpenAI-compatible chat completion response. */
export type OpenAIChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/** Loads and parses provider.registry.yaml into a ProviderRegistry (cached after first call). */
export declare function loadProviderRegistry(): ProviderRegistry;

/** Resets the cached provider registry (useful for testing or hot-reload). */
export declare function resetProviderRegistry(): void;

/** Strips unknown fields and normalises an OpenAIChatRequest into RouterRequest. */
export declare function normalizeRequest(request: OpenAIChatRequest): RouterRequest;

/** Registers the POST /v1/chat/completions route. */
export declare function registerChatCompletionRoute(app: Hono): void;

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

/** Contract every provider adapter must implement. */
export interface ProviderAdapter {
  readonly id: string;
  supports(request: RouterRequest, provider: ProviderCandidate): boolean;
  transformRequest(request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest;
  send(request: ProviderRequest): Promise<ProviderResponse>;
}

/** Creates an adapter that works with any OpenAI-compatible chat API. */
export declare function createOpenAiCompatibleAdapter(): ProviderAdapter;

/** Reads an API key from the environment for the given env-var name. */
export declare function resolveApiKey(apiKeyEnv: string): string | undefined;

/** Error response body returned by the chat completion endpoint. */
export type ChatCompletionErrorResponse = {
  error: {
    message: string;
    type: string;
    code: string;
  };
};

/** Routes a chat completion request through the best available provider. */
export declare function routeChatCompletion(chatRequest: OpenAIChatRequest): Promise<OpenAIChatCompletionResponse>;
