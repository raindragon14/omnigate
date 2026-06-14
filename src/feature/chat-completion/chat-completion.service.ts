import type { ChatCompletionRouteResult, OpenAIChatRequest, ProviderCandidate, ProviderCooldownStore, ProviderErrorCategory, ProviderStatsById, ProviderStatsRepository } from "../../shared/signatures";
import { normalizeRequest } from "../../router/request-normalizer";
import { selectProviderCandidates } from "../../router/provider-selector";
import { rankProviderCandidates } from "../../router/provider-scorer";
import { runProviderFallback, runProviderStreamFallback } from "../../router/fallback-runner";
import { createProviderCooldownStore } from "../../router/provider-cooldown";
import { createOpenAiCompatibleAdapter } from "../../provider/openai-compatible-adapter";
import { DEFAULT_DATABASE_PATH } from "../../config/config-loader";
import { loadProviderRegistry, resolveApiKey } from "../../config/provider-loader";
import { createProviderStatsRepository, formatStatsDay } from "../../storage/provider-stats.repository";
import { createSqliteDatabase, migrateSqliteDatabase } from "../../storage/sqlite.database";

const NO_PROVIDER_CODE: ProviderErrorCategory = "no_provider_available";
const NO_PROVIDER_MESSAGE = "No available provider for this request";

const cooldownStore = createProviderCooldownStore();
let cachedProviderStatsRepository: ProviderStatsRepository | undefined;
let configuredDatabasePath = DEFAULT_DATABASE_PATH;

/**
 * Configures the SQLite database path used for chat-completion routing stats.
 * @param databasePath  SQLite database path from AppConfig.
 */
export function configureChatCompletionStorage(databasePath: string): void {
  configuredDatabasePath = databasePath;
  cachedProviderStatsRepository = undefined;
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
export async function routeChatCompletion(chatRequest: OpenAIChatRequest): Promise<ChatCompletionRouteResult> {
  const routerRequest = normalizeRequest(chatRequest);
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
  const rankedCandidates = rankProviderCandidates({
    request: routerRequest,
    providers: candidates,
    statsByProviderId,
  });

  try {
    const fallbackInput = {
      request: routerRequest,
      providers: rankedCandidates,
      adapter: createOpenAiCompatibleAdapter(),
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
    const err = error as Error & { code?: ProviderErrorCategory };

    throw new RoutingError(err.code ?? NO_PROVIDER_CODE, err.message);
  }
}

function getProviderStatsRepository(): ProviderStatsRepository {
  if (cachedProviderStatsRepository !== undefined) {
    return cachedProviderStatsRepository;
  }

  const database = createSqliteDatabase(configuredDatabasePath);

  migrateSqliteDatabase(database);
  cachedProviderStatsRepository = createProviderStatsRepository(database);
  return cachedProviderStatsRepository;
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
