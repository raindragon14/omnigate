import type { OpenAIChatCompletionResponse, OpenAIChatRequest, ProviderErrorCategory } from "../../shared/signatures";
import { normalizeRequest } from "../../router/request-normalizer";
import { selectProviderCandidates } from "../../router/provider-selector";
import { rankProviderCandidates } from "../../router/provider-scorer";
import { runProviderFallback } from "../../router/fallback-runner";
import { createProviderCooldownStore } from "../../router/provider-cooldown";
import { createOpenAiCompatibleAdapter } from "../../provider/openai-compatible-adapter";
import { loadProviderRegistry, resolveApiKey } from "../../config/provider-loader";

const NO_PROVIDER_CODE: ProviderErrorCategory = "no_provider_available";
const NO_PROVIDER_MESSAGE = "No available provider for this request";

const cooldownStore = createProviderCooldownStore();

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
 * @returns The provider's response shaped as an OpenAIChatCompletionResponse.
 * @throws {RoutingError} When no provider is available or all providers fail.
 */
export async function routeChatCompletion(chatRequest: OpenAIChatRequest): Promise<OpenAIChatCompletionResponse> {
  const routerRequest = normalizeRequest(chatRequest);
  const registry = loadProviderRegistry();

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

  const rankedCandidates = rankProviderCandidates(routerRequest, candidates);

  try {
    return await runProviderFallback({
      request: routerRequest,
      providers: rankedCandidates,
      adapter: createOpenAiCompatibleAdapter(),
      resolveApiKey,
      cooldownStore,
      nowMs: () => Date.now(),
    });
  } catch (error) {
    const err = error as Error & { code?: ProviderErrorCategory };

    throw new RoutingError(err.code ?? NO_PROVIDER_CODE, err.message);
  }
}
