import type {
  FallbackRunnerInput,
  OpenAIChatCompletionResponse,
  ProviderCandidate,
  ProviderErrorCategory,
  ProviderResponse,
} from "../shared/signatures";
import { computeCooldownUntil } from "./provider-cooldown";

const NO_PROVIDER_CODE: ProviderErrorCategory = "no_provider_available";
const NO_PROVIDER_MESSAGE = "No available provider for this request";
const ALL_PROVIDERS_FAILED_MESSAGE = "All providers failed to handle this request";

const RATE_LIMITED_CODE: ProviderErrorCategory = "provider_rate_limited";
const SERVER_ERROR_CODE: ProviderErrorCategory = "provider_server_error";
const AUTH_ERROR_CODE: ProviderErrorCategory = "provider_auth_error";
const TIMEOUT_CODE: ProviderErrorCategory = "provider_timeout";
const NETWORK_ERROR_CODE: ProviderErrorCategory = "provider_network_error";
const MALFORMED_RESPONSE_CODE: ProviderErrorCategory = "provider_malformed_response";

/**
 * Classifies a provider HTTP response or error into a ProviderErrorCategory.
 * @param response  The provider response (may be undefined for network/timeout errors).
 * @param error     The caught error, if any.
 * @returns The classified error category.
 */
export function classifyProviderError(response: ProviderResponse | undefined, error: unknown): ProviderErrorCategory {
  if (error instanceof DOMException && error.name === "AbortError") {
    return TIMEOUT_CODE;
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return NETWORK_ERROR_CODE;
  }

  if (response === undefined) {
    return NETWORK_ERROR_CODE;
  }

  const status = response.status;

  if (response.isMalformed === true) {
    return MALFORMED_RESPONSE_CODE;
  }

  if (status === 429) {
    return RATE_LIMITED_CODE;
  }

  if (status === 401 || status === 403) {
    return AUTH_ERROR_CODE;
  }

  if (status >= 500 && status < 600) {
    return SERVER_ERROR_CODE;
  }

  return MALFORMED_RESPONSE_CODE;
}

/**
 * Routes the request through the ranked provider list, attempting fallback
 * on rate-limited, timeout, server-error, network-error, and malformed-response
 * failures.  On rate-limit, sets cooldown.
 * @param input  Fallback runner parameters.
 * @returns The first successful OpenAI-compatible response.
 * @throws Error when all providers fail.
 */
export async function runProviderFallback(input: FallbackRunnerInput): Promise<OpenAIChatCompletionResponse> {
  const { providers } = input;

  if (providers.length === 0) {
    throw createProviderError(NO_PROVIDER_CODE, NO_PROVIDER_MESSAGE);
  }

  const attemptedIds = new Set<string>();
  let lastCategory: ProviderErrorCategory = NO_PROVIDER_CODE;

  for (const provider of providers) {
    if (!shouldAttemptProvider(provider, input, attemptedIds)) {
      continue;
    }

    try {
      const result = await attemptProvider(provider, input);

      if (result.response !== undefined) {
        return result.response;
      }

      lastCategory = result.category;

      if (shouldContinueFallback(result.category)) {
        continue;
      }
    } catch (error) {
      const category = classifyProviderError(undefined, error);

      lastCategory = category;

      if (isFallbackWorthy(category)) {
        continue;
      }

      const thrownError = error as Error & { code?: ProviderErrorCategory };

      thrownError.code = category;
      throw thrownError;
    }
  }

  throw createProviderError(lastCategory, ALL_PROVIDERS_FAILED_MESSAGE);
}

type ProviderAttemptResult = {
  response?: OpenAIChatCompletionResponse | undefined;
  category: ProviderErrorCategory;
};

function shouldAttemptProvider(
  provider: ProviderCandidate,
  input: FallbackRunnerInput,
  attemptedIds: Set<string>,
): boolean {
  if (attemptedIds.has(provider.id)) {
    return false;
  }

  attemptedIds.add(provider.id);

  return hasProviderApiKey(provider, input.resolveApiKey);
}

async function attemptProvider(provider: ProviderCandidate, input: FallbackRunnerInput): Promise<ProviderAttemptResult> {
  const apiKey = input.resolveApiKey(provider.apiKeyEnv) ?? "";
  const providerRequest = input.adapter.transformRequest(input.request, provider, apiKey);
  const providerResponse = await input.adapter.send(providerRequest);

  if (providerResponse.status === 200 && isOpenAiChatCompletionResponse(providerResponse.body)) {
    return { response: providerResponse.body as unknown as OpenAIChatCompletionResponse, category: NO_PROVIDER_CODE };
  }

  const category = classifyProviderError(providerResponse, undefined);

  if (category === RATE_LIMITED_CODE) {
    setProviderCooldown(provider, providerResponse, input);
  }

  return { category };
}

function hasProviderApiKey(
  provider: ProviderCandidate,
  resolveApiKey: (apiKeyEnv: string) => string | undefined,
): boolean {
  const apiKey = resolveApiKey(provider.apiKeyEnv);

  return apiKey !== undefined && apiKey !== "";
}

function setProviderCooldown(
  provider: ProviderCandidate,
  response: ProviderResponse,
  input: FallbackRunnerInput,
): void {
  const currentNowMs = input.nowMs();

  input.cooldownStore.setCooldown(provider.id, computeCooldownUntil(response.headers, currentNowMs));
}

function shouldContinueFallback(category: ProviderErrorCategory): boolean {
  return category === AUTH_ERROR_CODE || isFallbackWorthy(category);
}

function isFallbackWorthy(category: ProviderErrorCategory): boolean {
  return (
    category === RATE_LIMITED_CODE ||
    category === TIMEOUT_CODE ||
    category === SERVER_ERROR_CODE ||
    category === NETWORK_ERROR_CODE ||
    category === MALFORMED_RESPONSE_CODE
  );
}

function createProviderError(code: ProviderErrorCategory, message: string): Error & { code: ProviderErrorCategory } {
  const error = new Error(message) as Error & { code: ProviderErrorCategory };

  error.code = code;
  return error;
}

function isOpenAiChatCompletionResponse(body: Record<string, unknown>): boolean {
  return (
    typeof body.id === "string" &&
    typeof body.object === "string" &&
    typeof body.created === "number" &&
    typeof body.model === "string" &&
    Array.isArray(body.choices)
  );
}
