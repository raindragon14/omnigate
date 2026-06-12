import type { AliasConfig, OpenAIChatCompletionResponse, OpenAIChatRequest, ProviderCandidate } from "../../shared/signatures";
import { normalizeRequest } from "../../router/request-normalizer";
import { createOpenAiCompatibleAdapter } from "../../provider/openai-compatible-adapter";
import { loadProviderRegistry, resolveApiKey } from "../../config/provider-loader";
import { HTTP_STATUS_OK } from "../../shared/http-status";

const NO_PROVIDER_CODE = "no_provider_available";
const NO_PROVIDER_MESSAGE = "No available provider for this request";
const NO_API_KEY_CODE = "no_api_key";
const NO_API_KEY_MESSAGE = "No provider has a configured API key for this model";
const PROVIDER_FAILURE_CODE = "provider_request_failed";
const PROVIDER_REQUEST_FAILED_MESSAGE = "Provider request failed";

/**
 * Error with a machine-readable code for the controller to map to HTTP status.
 * Thrown when no provider is available, API keys are missing, or the upstream
 * provider returns a non-200 status.
 */
export class RoutingError extends Error {
  /** Machine-readable error code (e.g. "no_provider_available", "no_api_key"). */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "RoutingError";
  }
}

/**
 * Routes a chat completion request through the best available provider.
 * Orchestrates request normalisation, provider selection, API key resolution,
 * adapter dispatch, and response handling.
 * @param chatRequest  The validated OpenAI-compatible chat request.
 * @returns The provider's response shaped as an OpenAIChatCompletionResponse.
 * @throws {RoutingError} When no provider is available, API keys are missing,
 *   or the upstream provider returns a non-200 status.
 */
export async function routeChatCompletion(chatRequest: OpenAIChatRequest): Promise<OpenAIChatCompletionResponse> {
  const routerRequest = normalizeRequest(chatRequest);
  const registry = loadProviderRegistry();
  const candidate = selectBestProvider(routerRequest.model, registry.providers, registry.aliases);

  if (candidate === undefined) {
    throw new RoutingError(NO_PROVIDER_CODE, NO_PROVIDER_MESSAGE);
  }

  const apiKey = resolveApiKey(candidate.apiKeyEnv);

  if (apiKey === undefined || apiKey === "") {
    throw new RoutingError(NO_API_KEY_CODE, NO_API_KEY_MESSAGE);
  }

  const adapter = createOpenAiCompatibleAdapter();
  const providerRequest = adapter.transformRequest(routerRequest, candidate, apiKey);
  const providerResponse = await adapter.send(providerRequest);

  if (providerResponse.status !== HTTP_STATUS_OK) {
    throw new RoutingError(PROVIDER_FAILURE_CODE, extractErrorMessage(providerResponse.body));
  }

  return providerResponse.body as OpenAIChatCompletionResponse;
}

/**
 * Finds the best (highest priority) enabled provider that matches the given
 * model alias.  Exported for unit-testing.
 * @param modelAlias  The model alias string (e.g. "omnigate/deepseek-v4-flash-auto").
 * @param providers   The list of provider candidates to search.
 * @param aliases     Alias configuration mapping alias names to family lists.
 * @returns The best matching ProviderCandidate, or undefined when no match exists.
 */
export function selectBestProvider(
  modelAlias: string,
  providers: ProviderCandidate[],
  aliases: Record<string, AliasConfig>,
): ProviderCandidate | undefined {
  const aliasConfig = aliases[modelAlias];

  if (aliasConfig === undefined) {
    return undefined;
  }

  const shouldAllowPaid = aliasConfig.allow_paid === true;

  const matchingProviders = providers
    .filter((candidate) => aliasConfig.families.includes(candidate.family))
    .filter((candidate) => candidate.enabled && (shouldAllowPaid || !candidate.paidFallback))
    .sort((first, second) => second.priority - first.priority);

  return matchingProviders[0];
}

function extractErrorMessage(body: Record<string, unknown>): string {
  if (typeof body.error !== "object" || body.error === null) {
    return PROVIDER_REQUEST_FAILED_MESSAGE;
  }

  const errorRecord = body.error as Record<string, unknown>;

  if (typeof errorRecord.message !== "string") {
    return PROVIDER_REQUEST_FAILED_MESSAGE;
  }

  return errorRecord.message;
}
