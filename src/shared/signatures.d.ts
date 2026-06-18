import type { Context, Hono } from "hono";
import type { Database } from "bun:sqlite";

// ===========================================================================
// Constants
// ===========================================================================

/** Default port used when the PORT environment variable is not set. */
export declare const DEFAULT_PORT: 8787;
/** Default SQLite path used when OMNIGATE_DB_PATH is not set. */
export declare const DEFAULT_DATABASE_PATH: ".data/omnigate.sqlite";

/** HTTP 200 OK. */
export declare const HTTP_STATUS_OK: 200;
/** HTTP 400 Bad Request. */
export declare const HTTP_STATUS_BAD_REQUEST: 400;
/** HTTP 401 Unauthorized. */
export declare const HTTP_STATUS_UNAUTHORIZED: 401;
/** HTTP 429 Too Many Requests. */
export declare const HTTP_STATUS_TOO_MANY_REQUESTS: 429;
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
  omnigateApiKey: string;
  databasePath: string;
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
export declare function createApp(appConfig?: AppConfig): Hono;

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
 * Registers Bearer-token authentication for OpenAI-compatible /v1 routes.
 * @param app     The Hono application instance.
 * @param apiKey  The expected OmniGate API key.
 */
export declare function registerApiKeyAuth(app: Hono, apiKey: string): void;

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

/** Routing mode that influences provider scoring. */
export type RoutingMode = "balanced" | "quality" | "speed" | "survival";

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
  tools?: unknown[] | undefined;
  tool_choice?: unknown | undefined;
  response_format?: unknown | undefined;
};

/** Normalised internal representation of a chat completion request. */
export type RouterRequest = {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  topP?: number | undefined;
  stream: boolean;
  tools?: unknown[] | undefined;
  toolChoice?: unknown | undefined;
  responseFormat?: unknown | undefined;
  mode: RoutingMode;
};

/** Rate-limit configuration for a single provider. */
export type ProviderRateLimit = {
  rpm?: number | undefined;
  rph?: number | undefined;
  rpd?: number | undefined;
};

/** A single provider entry from the registry, ready for selection and routing. */
export type ProviderCandidate = {
  id: string;
  baseUrl: string;
  model: string;
  family: string;
  priority: number;
  qualityScore: number;
  speedScore?: number | undefined;
  enabled: boolean;
  paidFallback: boolean;
  apiKeyEnv: string;
  context: number;
  supportsTools: boolean;
  supportsJson: boolean;
  supportsStreaming: boolean;
  rateLimit: ProviderRateLimit;
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
  headers: Record<string, string>;
  isMalformed?: boolean | undefined;
};

/** Shape of an upstream streaming provider response before body consumption. */
export type ProviderStreamResponse = {
  status: number;
  headers: Record<string, string>;
  stream?: ReadableStream<Uint8Array> | undefined;
};

/** Provider attempt status persisted as local routing stats. */
export type ProviderAttemptStatus = "success" | "failure" | "rate_limited";

/** Persisted routing signals for a provider/model/day tuple. */
export type ProviderStatsRecord = {
  providerId: string;
  modelFamily: string;
  day: string;
  requestCount: number;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  rateLimitCount: number;
  avgLatencyMs?: number | undefined;
  avgTokensPerSecond?: number | undefined;
  avgTimeToFirstTokenMs?: number | undefined;
  cooldownUntil?: number | undefined;
};

/** Provider attempt update stored after an upstream call completes or fails. */
export type ProviderStatsUpdate = {
  providerId: string;
  modelFamily: string;
  status: ProviderAttemptStatus;
  latencyMs: number;
  tokenCount?: number | undefined;
  tokensPerSecond?: number | undefined;
  timeToFirstTokenMs?: number | undefined;
  cooldownUntil?: number | undefined;
  nowMs: number;
};

/** Repository for local provider routing signals. */
export interface ProviderStatsRepository {
  getProviderStats(providerId: string, modelFamily: string, day: string): ProviderStatsRecord | undefined;
  recordProviderAttempt(update: ProviderStatsUpdate): void;
  getCooldownUntil(providerId: string, modelFamily: string): number | undefined;
}

/**
 * Opens a SQLite database and creates its parent directory when file-backed.
 * @param databasePath  SQLite database path or `:memory:` for tests.
 * @returns An open Bun SQLite Database instance.
 */
export declare function createSqliteDatabase(databasePath: string): Database;

/**
 * Applies idempotent SQLite schema migrations required by OmniGate.
 * @param database  Open SQLite database connection.
 */
export declare function migrateSqliteDatabase(database: Database): void;

/**
 * Creates a provider stats repository backed by SQLite.
 * @param database  Open SQLite database connection.
 * @returns A ProviderStatsRepository instance.
 */
export declare function createProviderStatsRepository(database: Database): ProviderStatsRepository;

/**
 * Formats a timestamp as the UTC day key used by provider stats rows.
 * @param nowMs  Timestamp in milliseconds.
 * @returns A YYYY-MM-DD UTC day string.
 */
export declare function formatStatsDay(nowMs: number): string;

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

/** Streaming chat response passed through as OpenAI-compatible SSE bytes. */
export type OpenAIChatStreamResponse = {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
};

/** Route result for either JSON completion or streaming SSE completion. */
export type ChatCompletionRouteResult =
  | { type: "json"; response: OpenAIChatCompletionResponse }
  | { type: "stream"; response: OpenAIChatStreamResponse };

/**
 * Loads and parses provider.registry.yaml into a typed ProviderRegistry.
 * The result is cached after the first call to avoid repeated disk I/O.
 * @returns The parsed provider registry.
 */
export declare function loadProviderRegistry(): ProviderRegistry;

/**
 * Validates and converts raw provider registry data into routing candidates.
 * @param rawRegistry  Parsed YAML registry data with unknown shape.
 * @returns A typed ProviderRegistry ready for routing.
 * @throws {Error} When the registry shape is invalid.
 */
export declare function parseProviderRegistry(rawRegistry: unknown): ProviderRegistry;

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

/**
 * Configures the SQLite database path used for chat-completion routing stats.
 * @param databasePath  SQLite database path from AppConfig.
 */
export declare function configureChatCompletionStorage(databasePath: string): void;

/**
 * Routes a chat completion request through the best available provider.
 * @param chatRequest  The validated OpenAI-compatible chat request.
 * @returns A JSON completion result or streaming SSE pass-through result.
 */
export declare function routeChatCompletion(chatRequest: OpenAIChatRequest): Promise<ChatCompletionRouteResult>;

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
  /** Sends the provider request over HTTP and returns an unconsumed stream response. */
  sendStream(request: ProviderRequest): Promise<ProviderStreamResponse>;
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

// ---------------------------------------------------------------------------
// Routing & selection
// ---------------------------------------------------------------------------

/** Error categories returned by adapters and classified by the router. */
export type ProviderErrorCategory =
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_server_error"
  | "provider_auth_error"
  | "provider_malformed_response"
  | "provider_network_error"
  | "no_provider_available"
  | "invalid_request";

/**
 * Custom error with a machine-readable code that the controller uses to
 * determine the appropriate HTTP status code (400 vs 500).
 * @param code    Machine-readable error code.
 * @param message Human-readable error description.
 */
export declare class RoutingError extends Error {
  readonly code: ProviderErrorCategory;
  constructor(code: ProviderErrorCategory, message: string);
}

/** Input for selecting eligible provider candidates. */
export type ProviderSelectionInput = {
  request: RouterRequest;
  providers: ProviderCandidate[];
  aliases: Record<string, AliasConfig>;
  cooldownStore: ProviderCooldownStore;
  resolveApiKey: (apiKeyEnv: string) => string | undefined;
  nowMs: number;
};

/**
 * Filters and returns eligible provider candidates for the given request.
 * Rejects disabled providers, missing API keys, paid fallback unless allowed,
 * providers in cooldown, and providers missing required features.
 * @param input  Selection parameters.
 * @returns An array of eligible ProviderCandidate values (empty when none match).
 */
export declare function selectProviderCandidates(input: ProviderSelectionInput): ProviderCandidate[];

/** Score for a single provider candidate. */
export type ProviderScore = {
  providerId: string;
  score: number;
};

/** Stats lookup used by provider scoring, keyed by provider id. */
export type ProviderStatsById = Record<string, ProviderStatsRecord | undefined>;

/** Input for scoring a single provider candidate. */
export type ProviderScoringInput = {
  request: RouterRequest;
  provider: ProviderCandidate;
  stats?: ProviderStatsRecord | undefined;
};

/** Input for ranking provider candidates. */
export type ProviderRankingInput = {
  request: RouterRequest;
  providers: ProviderCandidate[];
  statsByProviderId?: ProviderStatsById | undefined;
};

/**
 * Computes a numeric score for a single provider candidate using configured
 * scores, request mode, feature support, and optional persisted stats.
 * @param input  Provider scoring inputs.
 * @returns A ProviderScore with providerId and score.
 */
export declare function scoreProvider(input: ProviderScoringInput): ProviderScore;

/**
 * Ranks provider candidates by descending stats-aware score.
 * @param input  Provider ranking inputs.
 * @returns The candidates sorted from highest to lowest score.
 */
export declare function rankProviderCandidates(input: ProviderRankingInput): ProviderCandidate[];

/** In-memory cooldown store for tracking provider 429 cooldowns. */
export interface ProviderCooldownStore {
  /** Returns the cooldown timestamp (ms) for a provider, or undefined if not cooling down. */
  getCooldownUntil(providerId: string): number | undefined;
  /** Sets a cooldown expiration timestamp (ms) for a provider. */
  setCooldown(providerId: string, cooldownUntilMs: number): void;
  /** Returns true when the provider is still cooling down at the given time. */
  isProviderCoolingDown(providerId: string, nowMs: number): boolean;
}

/**
 * Creates an in-memory cooldown store backed by a Map.
 * @returns A ProviderCooldownStore instance.
 */
export declare function createProviderCooldownStore(): ProviderCooldownStore;

/**
 * Parses a Retry-After header value into milliseconds from now.
 * Handles both seconds and HTTP-date formats.
 * @param rawHeader  The raw Retry-After header value, or undefined.
 * @param nowMs      Current time in milliseconds.
 * @returns Milliseconds from now to wait, or undefined when unparseable.
 */
export declare function parseRetryAfterMs(rawHeader: string | undefined, nowMs: number): number | undefined;

/** Input for running the fallback loop. */
export type FallbackRunnerInput = {
  request: RouterRequest;
  providers: ProviderCandidate[];
  adapter: ProviderAdapter;
  resolveApiKey: (apiKeyEnv: string) => string | undefined;
  cooldownStore: ProviderCooldownStore;
  providerStatsRepository?: ProviderStatsRepository | undefined;
  nowMs: () => number;
};

/**
 * Routes the request through the ranked provider list, attempting fallback
 * on rate-limited, timeout, server-error, network-error, and malformed-response
 * failures.  On rate-limit, sets cooldown.
 * @param input  Fallback runner parameters.
 * @returns The first successful OpenAI-compatible response.
 * @throws {RoutingError} When all providers fail.
 */
export declare function runProviderFallback(input: FallbackRunnerInput): Promise<OpenAIChatCompletionResponse>;

/**
 * Routes a streaming request through providers, falling back only before a
 * readable upstream stream is returned.
 * @param input  Fallback runner parameters.
 * @returns The first successful streaming response.
 * @throws {RoutingError} When all providers fail before streaming starts.
 */
export declare function runProviderStreamFallback(input: FallbackRunnerInput): Promise<OpenAIChatStreamResponse>;

/**
 * Classifies a provider HTTP response or error into a ProviderErrorCategory.
 * @param response  The provider response (may be undefined for network/timeout errors).
 * @param error     The caught error, if any.
 * @returns The classified error category.
 */
export declare function classifyProviderError(
  response: ProviderResponse | undefined,
  error: unknown,
): ProviderErrorCategory;

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
