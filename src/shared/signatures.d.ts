import type { Context, Hono } from "hono";

// ===========================================================================
// Constants
// ===========================================================================

/** Default port used when the PORT environment variable is not set. */
export declare const DEFAULT_PORT: 8787;

/** HTTP 200 OK. */
export declare const HTTP_STATUS_OK: 200;
/** HTTP 400 Bad Request. */
export declare const HTTP_STATUS_BAD_REQUEST: 400;
/** HTTP 404 Not Found. */
export declare const HTTP_STATUS_NOT_FOUND: 404;
/** HTTP 500 Internal Server Error. */
export declare const HTTP_STATUS_INTERNAL_SERVER_ERROR: 500;

/** Route path for the chat completion endpoint. */
export declare const ROUTE_PATH: "/v1/chat/completions";

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

/**
 * Creates and configures the Hono application with all feature routes
 * (health, models, chat completions) and global error handling.
 */
export declare function createApp(): Hono;

/**
 * Loads AppConfig from the runtime environment (Bun.env).
 * @returns A fully validated AppConfig instance.
 */
export declare function loadAppConfig(): AppConfig;

/**
 * Parses a raw environment record into an AppConfig, validating the PORT value.
 * @param environment  Key/value pairs (typically from Bun.env or process.env).
 * @returns A validated AppConfig.
 * @throws {Error} If PORT is missing, non-numeric, or outside 1-65535.
 */
export declare function parseAppConfig(environment: Record<string, string | undefined>): AppConfig;

/**
 * Registers global notFound and onError handlers that return OpenAI-compatible
 * error shapes for all unhandled routes and unexpected exceptions.
 * @param app  The Hono application instance.
 */
export declare function registerAppErrorHandler(app: Hono): void;

/**
 * Registers the GET /health route.
 * @param app  The Hono application instance.
 */
export declare function registerHealthRoute(app: Hono): void;

/**
 * Registers the GET /v1/models route.
 * @param app  The Hono application instance.
 */
export declare function registerModelRoute(app: Hono): void;

/**
 * Returns the current service health status.
 * @returns A HealthResponse with status "ok" and service name "omnigate".
 */
export declare function getHealthStatus(): HealthResponse;

/**
 * Returns the hardcoded list of model aliases exposed by the router.
 * @returns A ModelListResponse containing all router model aliases.
 */
export declare function listRouterModels(): ModelListResponse;

/**
 * Wraps a value in a successful Result.
 * @template TValue  The type of the value to wrap.
 * @param value  The value to wrap.
 * @returns A Result in the "ok" state.
 */
export declare function createOkResult<TValue>(value: TValue): Result<TValue>;

/**
 * Wraps an error in a failed Result.
 * @template TValue  The type of the value (unused in failure state).
 * @template TError  The type of the error.
 * @param error  The error to wrap.
 * @returns A Result in the "error" state.
 */
export declare function createErrorResult<TValue, TError>(error: TError): Result<TValue, TError>;

/**
 * Creates an AppError with the given code, message, and HTTP status code.
 * @param code        Machine-readable error code.
 * @param message     Human-readable error description.
 * @param statusCode  HTTP status code (e.g. 400, 404, 500).
 * @returns A structured AppError object.
 */
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

/**
 * Loads and parses provider.registry.yaml into a typed ProviderRegistry.
 * The result is cached after the first call to avoid repeated disk I/O.
 * @returns The parsed provider registry.
 */
export declare function loadProviderRegistry(): ProviderRegistry;

/**
 * Resets the cached provider registry so the next call to loadProviderRegistry
 * re-reads the YAML file from disk.  Useful for testing or hot-reload scenarios.
 */
export declare function resetProviderRegistry(): void;

/**
 * Strips unknown provider-specific fields from an incoming OpenAI-compatible
 * request and converts it into the canonical RouterRequest shape.
 * @param request  The raw incoming request body.
 * @returns A normalised RouterRequest with snake_case converted to camelCase.
 */
export declare function normalizeRequest(request: OpenAIChatRequest): RouterRequest;

/**
 * Registers the POST /v1/chat/completions route on the given Hono application.
 * @param app  The Hono application instance.
 */
export declare function registerChatCompletionRoute(app: Hono): void;

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

/** Contract every provider adapter must implement. */
export interface ProviderAdapter {
  /** Unique identifier for this adapter type (e.g. "openai-compatible"). */
  readonly id: string;
  /** Returns true when this adapter can handle the given request through the given provider. */
  supports(request: RouterRequest, provider: ProviderCandidate): boolean;
  /** Converts a normalised RouterRequest into a provider-specific HTTP request. */
  transformRequest(request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest;
  /** Sends the provider request over HTTP and returns the raw response. */
  send(request: ProviderRequest): Promise<ProviderResponse>;
}

/**
 * Factory function that creates a ProviderAdapter for any OpenAI-compatible
 * chat API.  The adapter builds requests at `{baseUrl}/chat/completions` with
 * a Bearer token Authorization header and a 30-second timeout via AbortController.
 * @returns A configured ProviderAdapter instance.
 */
export declare function createOpenAiCompatibleAdapter(): ProviderAdapter;

/**
 * Reads an API key from the environment for the given env-var name.
 * @param apiKeyEnv  The name of the environment variable (e.g. "HF_TOKEN").
 * @returns The API key string, or undefined when not set.
 */
export declare function resolveApiKey(apiKeyEnv: string): string | undefined;

/** Error response body returned by the chat completion endpoint. */
export type ChatCompletionErrorResponse = {
  error: {
    message: string;
    type: string;
    code: string;
  };
};

/** A chat completion response that is either a successful OpenAI response or an error shape. */
export type ChatCompletionResponse = OpenAIChatCompletionResponse | ChatCompletionErrorResponse;

/**
 * Routes a chat completion request through the best available provider.
 * Orchestrates request normalisation, provider selection, API key resolution,
 * adapter dispatch, and response handling.
 * @param chatRequest  The validated OpenAI-compatible chat request.
 * @returns The provider's response shaped as an OpenAIChatCompletionResponse.
 * @throws {RoutingError} When no provider is available, API keys are missing,
 *   or the upstream provider returns a non-200 status.
 */
export declare function routeChatCompletion(chatRequest: OpenAIChatRequest): Promise<OpenAIChatCompletionResponse>;

// ---------------------------------------------------------------------------
// Routing & selection
// ---------------------------------------------------------------------------

/**
 * Custom error with a machine-readable code that the controller uses to
 * determine the appropriate HTTP status code (400 vs 500).
 * @param code    Machine-readable error code.
 * @param message Human-readable error description.
 */
export declare class RoutingError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

/**
 * Finds the best (highest priority) enabled provider that matches the given
 * model alias.
 * @param modelAlias  The model alias string (e.g. "omnigate/deepseek-v4-flash-auto").
 * @param providers   The list of provider candidates to search.
 * @param aliases     Alias configuration mapping alias names to family lists.
 * @returns The best matching ProviderCandidate, or undefined when no match exists.
 */
export declare function selectBestProvider(
  modelAlias: string,
  providers: ProviderCandidate[],
  aliases: Record<string, AliasConfig>,
): ProviderCandidate | undefined;

// ---------------------------------------------------------------------------
// HTTP controllers
// ---------------------------------------------------------------------------

/**
 * Handles GET /health requests.
 * @param context  Hono request context.
 * @returns A JSON Response with service liveness status.
 */
export declare function getHealthController(context: Context): Response;

/**
 * Handles GET /v1/models requests.
 * @param context  Hono request context.
 * @returns A JSON Response with the list of router model aliases.
 */
export declare function listModelController(context: Context): Response;

/**
 * Handles POST /v1/chat/completions requests.
 * @param context  Hono request context.
 * @returns A JSON Response containing either the completion or an error shape.
 */
export declare function handleChatCompletion(context: Context): Promise<Response>;
