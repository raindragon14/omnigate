import type {
  ChatCompletionRouteResult,
  OpenAIChatRequest,
  ProviderCandidate,
  ProviderCooldownStore,
  ProviderErrorCategory,
  ProviderStatsById,
  ProviderStatsRepository,
  RouterRequest,
} from "../../shared/signatures";
import { normalizeRequest, UnsupportedMessageContentError } from "../../router/request-normalizer";
import { selectProviderCandidates } from "../../router/provider-selector";
import { rankProviderCandidates } from "../../router/provider-scorer";
import { runProviderFallback, runProviderStreamFallback } from "../../router/fallback-runner";
import { createProviderCooldownStore } from "../../router/provider-cooldown";
import { createOpenAiCompatibleAdapter } from "../../provider/openai-compatible-adapter";
import type { ProviderAdapter } from "../../provider/provider-adapter";
import { loadProviderRegistry, resolveApiKey } from "../../config/provider-loader";
import { formatStatsDay } from "../../storage/provider-stats.repository";
import {
  configureStatsStore,
  getStatsStoreRepository,
  resetStatsStore,
} from "../../storage/stats-store";

const NO_PROVIDER_CODE: ProviderErrorCategory = "no_provider_available";
const INVALID_REQUEST_CODE: ProviderErrorCategory = "invalid_request";
const INTERNAL_ERROR_CODE: ProviderErrorCategory = "internal_server_error";
const NO_PROVIDER_MESSAGE = "No available provider for this request";
const INTERNAL_ERROR_MESSAGE = "Internal server error";

let cooldownStore = createProviderCooldownStore();
let logBodiesEnabled = false;

/**
 * Resets the module-level routing state (cooldown store, cached repository,
 * and body-logging flag). Intended for tests; not needed in normal production use.
 */
export function resetChatCompletionRoutingState(): void {
  cooldownStore = createProviderCooldownStore();
  logBodiesEnabled = false;
  resetStatsStore();
}

/**
 * Enables or disables logging of chat-completion request/response bodies.
 * Bodies are only logged when explicitly enabled (opt-in debugging).
 * @param enabled  Whether body logging is enabled.
 */
export function configureChatCompletionLogging(enabled: boolean): void {
  logBodiesEnabled = enabled;
}

/**
 * Returns whether chat-completion body logging is enabled.
 * @returns True when request/response bodies are logged.
 */
export function isChatCompletionLoggingEnabled(): boolean {
  return logBodiesEnabled;
}

/**
 * Configures the SQLite database path used for chat-completion routing stats.
 * Closes any previously opened database so resources are not leaked when the
 * path changes (e.g. across test runs or config reloads).
 * @param databasePath  SQLite database path from AppConfig.
 */
export function configureChatCompletionStorage(databasePath: string): void {
  configureStatsStore(databasePath);
}

/**
 * Clears routing cooldowns from the in-memory store and the persisted stats.
 * @param providerId  Optional provider id; clears all providers when omitted.
 * @returns The number of cooldown entries cleared (memory + persisted).
 */
export function clearRoutingCooldowns(providerId?: string): number {
  const memoryCleared =
    providerId === undefined
      ? cooldownStore.clearAllCooldowns()
      : cooldownStore.clearCooldown(providerId)
        ? 1
        : 0;

  return memoryCleared + getProviderStatsRepository().clearProviderCooldowns(providerId);
}

/**
 * Deletes routing stats rows for one UTC day (today when omitted).
 * @param day  Optional UTC day key (YYYY-MM-DD).
 * @returns The number of rows deleted.
 */
export function resetRoutingStats(day: string = formatStatsDay(Date.now())): number {
  return getProviderStatsRepository().resetProviderStats(day);
}

/**
 * Error with a machine-readable code for the controller to map to HTTP status.
 * Thrown when no provider is available, API keys are missing, or the upstream
 * provider returns a non-200 status.
 */
export class RoutingError extends Error {
  /** Machine-readable error code (e.g. "no_provider_available", "no_api_key"). */
  readonly code: ProviderErrorCategory;

  constructor(code: ProviderErrorCategory, message: string) {
    super(message);
    this.code = code;
    this.name = "RoutingError";
  }
}

/**
 * Routes a chat completion request through the best available provider.
 * Orchestrates request normalisation, provider selection, ranking, API key
 * resolution, adapter dispatch, fallback, and response handling.
 * @param chatRequest  The validated OpenAI-compatible chat request.
 * @returns A JSON completion result or streaming SSE pass-through result.
 * @throws {RoutingError} When no provider is available or all providers fail.
 */
export async function routeChatCompletion(
  chatRequest: OpenAIChatRequest,
  adapter: ProviderAdapter = createOpenAiCompatibleAdapter(),
): Promise<ChatCompletionRouteResult> {
  const routerRequest = normalizeRouterRequest(chatRequest);
  const registry = loadProviderRegistry();

  const preliminaryCandidates = selectProviderCandidates({
    request: routerRequest,
    providers: registry.providers,
    aliases: registry.aliases,
    cooldownStore,
    resolveApiKey,
    nowMs: Date.now(),
  });

  if (preliminaryCandidates.length === 0) {
    throw new RoutingError(NO_PROVIDER_CODE, NO_PROVIDER_MESSAGE);
  }

  const providerStatsRepository = getProviderStatsRepository();

  syncPersistedCooldowns(registry.providers, providerStatsRepository, cooldownStore, Date.now());

  const candidates = selectProviderCandidates({
    request: routerRequest,
    providers: registry.providers,
    aliases: registry.aliases,
    cooldownStore,
    resolveApiKey,
    nowMs: Date.now(),
  });

  if (candidates.length === 0) {
    throw new RoutingError(NO_PROVIDER_CODE, NO_PROVIDER_MESSAGE);
  }

  const statsByProviderId = loadProviderStatsById(candidates, providerStatsRepository, Date.now());
  const aliasConfig = registry.aliases[routerRequest.model];
  const rankedCandidates = rankProviderCandidates({
    request: routerRequest,
    providers: candidates,
    statsByProviderId,
    aliasConfig,
  });

  try {
    const fallbackInput = {
      request: routerRequest,
      providers: rankedCandidates,
      adapter,
      resolveApiKey,
      cooldownStore,
      providerStatsRepository,
      nowMs: () => Date.now(),
    };

    if (routerRequest.stream) {
      return { type: "stream", response: await runProviderStreamFallback(fallbackInput) };
    }

    return { type: "json", response: await runProviderFallback(fallbackInput) };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? (error.code as ProviderErrorCategory) : undefined;

    throw new RoutingError(code ?? INTERNAL_ERROR_CODE, INTERNAL_ERROR_MESSAGE);
  }
}

function normalizeRouterRequest(chatRequest: OpenAIChatRequest): RouterRequest {
  try {
    return normalizeRequest(chatRequest);
  } catch (error) {
    if (error instanceof UnsupportedMessageContentError) {
      throw new RoutingError(INVALID_REQUEST_CODE, error.message);
    }

    throw error;
  }
}

function getProviderStatsRepository(): ProviderStatsRepository {
  return getStatsStoreRepository();
}

function syncPersistedCooldowns(
  providers: ProviderCandidate[],
  repository: ProviderStatsRepository,
  store: ProviderCooldownStore,
  nowMs: number,
): void {
  for (const provider of providers) {
    const cooldownUntil = repository.getCooldownUntil(provider.id, provider.family);

    if (cooldownUntil !== undefined && nowMs < cooldownUntil) {
      store.setCooldown(provider.id, cooldownUntil);
    }
  }
}

function loadProviderStatsById(
  providers: ProviderCandidate[],
  repository: ProviderStatsRepository,
  nowMs: number,
): ProviderStatsById {
  const day = formatStatsDay(nowMs);
  const statsByProviderId: ProviderStatsById = {};

  for (const provider of providers) {
    statsByProviderId[provider.id] = repository.getProviderStats(provider.id, provider.family, day);
  }

  return statsByProviderId;
}
