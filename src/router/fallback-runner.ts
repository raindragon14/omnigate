import type {
  FallbackRunnerInput,
  OpenAIChatStreamResponse,
  OpenAIChatCompletionResponse,
  ProviderAttemptStatus,
  ProviderCandidate,
  ProviderErrorCategory,
  ProviderResponse,
  ProviderStreamResponse,
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
const MILLISECONDS_PER_SECOND = 1_000;

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

/**
 * Routes a streaming request through providers, falling back only before a
 * readable upstream stream is returned.
 * @param input  Fallback runner parameters.
 * @returns The first successful streaming response.
 * @throws Error when all providers fail before streaming starts.
 */
export async function runProviderStreamFallback(input: FallbackRunnerInput): Promise<OpenAIChatStreamResponse> {
  if (input.providers.length === 0) {
    throw createProviderError(NO_PROVIDER_CODE, NO_PROVIDER_MESSAGE);
  }

  const attemptedIds = new Set<string>();
  let lastCategory: ProviderErrorCategory = NO_PROVIDER_CODE;

  for (const provider of input.providers) {
    const result = await tryStreamProvider(provider, input, attemptedIds);

    if (result.response !== undefined) {
      return result.response;
    }

    lastCategory = result.category;
  }

  throw createProviderError(lastCategory, ALL_PROVIDERS_FAILED_MESSAGE);
}

type ProviderAttemptResult = {
  response?: OpenAIChatCompletionResponse | undefined;
  category: ProviderErrorCategory;
};

type ProviderStreamAttemptResult = {
  response?: OpenAIChatStreamResponse | undefined;
  category: ProviderErrorCategory;
};

async function tryStreamProvider(
  provider: ProviderCandidate,
  input: FallbackRunnerInput,
  attemptedIds: Set<string>,
): Promise<ProviderStreamAttemptResult> {
  if (!shouldAttemptProvider(provider, input, attemptedIds)) {
    return { category: NO_PROVIDER_CODE };
  }

  try {
    return await attemptStreamProvider(provider, input);
  } catch (error) {
    const category = classifyProviderError(undefined, error);

    recordProviderStats(input, provider, category, 0);
    return { category };
  }
}

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
  const startedAtMs = input.nowMs();
  const apiKey = input.resolveApiKey(provider.apiKeyEnv) ?? "";
  const providerRequest = input.adapter.transformRequest(input.request, provider, apiKey);
  let providerResponse: ProviderResponse;

  try {
    providerResponse = await input.adapter.send(providerRequest);
  } catch (error) {
    recordProviderStats(input, provider, classifyProviderError(undefined, error), elapsedMs(input, startedAtMs));
    throw error;
  }

  const latencyMs = elapsedMs(input, startedAtMs);

  if (providerResponse.status === 200 && isOpenAiChatCompletionResponse(providerResponse.body)) {
    const response = providerResponse.body as unknown as OpenAIChatCompletionResponse;

    recordProviderStats(input, provider, NO_PROVIDER_CODE, latencyMs, response);
    return { response, category: NO_PROVIDER_CODE };
  }

  const category = classifyProviderError(providerResponse, undefined);
  let cooldownUntil: number | undefined;

  if (category === RATE_LIMITED_CODE) {
    cooldownUntil = setProviderCooldown(provider, providerResponse, input);
  }

  recordProviderStats(input, provider, category, latencyMs, undefined, cooldownUntil);

  return { category };
}

async function attemptStreamProvider(
  provider: ProviderCandidate,
  input: FallbackRunnerInput,
): Promise<ProviderStreamAttemptResult> {
  const startedAtMs = input.nowMs();
  const apiKey = input.resolveApiKey(provider.apiKeyEnv) ?? "";
  const providerRequest = input.adapter.transformRequest(input.request, provider, apiKey);
  const providerResponse = await input.adapter.sendStream(providerRequest);
  const latencyMs = elapsedMs(input, startedAtMs);

  if (isSuccessfulStreamResponse(providerResponse)) {
    return { response: createStreamResponse(providerResponse, provider, input, startedAtMs), category: NO_PROVIDER_CODE };
  }

  const category = classifyStreamProviderError(providerResponse);
  const cooldownUntil = category === RATE_LIMITED_CODE ? setProviderCooldownFromHeaders(provider, providerResponse.headers, input) : undefined;

  recordProviderStats(input, provider, category, latencyMs, undefined, cooldownUntil);
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
): number {
  return setProviderCooldownFromHeaders(provider, response.headers, input);
}

function setProviderCooldownFromHeaders(
  provider: ProviderCandidate,
  headers: Record<string, string>,
  input: FallbackRunnerInput,
): number {
  const cooldownUntil = computeCooldownUntil(headers, input.nowMs());

  input.cooldownStore.setCooldown(provider.id, cooldownUntil);
  return cooldownUntil;
}

function recordProviderStats(
  input: FallbackRunnerInput,
  provider: ProviderCandidate,
  category: ProviderErrorCategory,
  latencyMs: number,
  response?: OpenAIChatCompletionResponse,
  cooldownUntil?: number,
  timeToFirstTokenMs?: number,
): void {
  try {
    input.providerStatsRepository?.recordProviderAttempt({
      providerId: provider.id,
      modelFamily: provider.family,
      status: toAttemptStatus(category),
      latencyMs,
      tokenCount: response?.usage?.total_tokens,
      tokensPerSecond: calculateTokensPerSecond(response, latencyMs),
      timeToFirstTokenMs,
      cooldownUntil,
      nowMs: input.nowMs(),
    });
  } catch {
    return;
  }
}

function createStreamResponse(
  response: ProviderStreamResponse,
  provider: ProviderCandidate,
  input: FallbackRunnerInput,
  startedAtMs: number,
): OpenAIChatStreamResponse {
  return {
    stream: trackFirstStreamChunk(response.stream!, () => recordStreamSuccess(input, provider, startedAtMs)),
    headers: response.headers,
  };
}

function trackFirstStreamChunk(stream: ReadableStream<Uint8Array>, onFirstChunk: () => void): ReadableStream<Uint8Array> {
  let hasFirstChunk = false;

  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!hasFirstChunk) {
        hasFirstChunk = true;
        onFirstChunk();
      }

      controller.enqueue(chunk);
    },
  }));
}

function recordStreamSuccess(input: FallbackRunnerInput, provider: ProviderCandidate, startedAtMs: number): void {
  const timeToFirstTokenMs = elapsedMs(input, startedAtMs);

  recordProviderStats(input, provider, NO_PROVIDER_CODE, timeToFirstTokenMs, undefined, undefined, timeToFirstTokenMs);
}

function isSuccessfulStreamResponse(response: ProviderStreamResponse): boolean {
  return response.status === 200 && response.stream !== undefined;
}

function classifyStreamProviderError(response: ProviderStreamResponse): ProviderErrorCategory {
  return classifyProviderError({
    status: response.status,
    body: {},
    headers: response.headers,
    isMalformed: response.status === 200 && response.stream === undefined,
  }, undefined);
}

function toAttemptStatus(category: ProviderErrorCategory): ProviderAttemptStatus {
  if (category === NO_PROVIDER_CODE) {
    return "success";
  }

  return category === RATE_LIMITED_CODE ? "rate_limited" : "failure";
}

function calculateTokensPerSecond(response: OpenAIChatCompletionResponse | undefined, latencyMs: number): number | undefined {
  const completionTokens = response?.usage?.completion_tokens;

  if (completionTokens === undefined || latencyMs <= 0) {
    return undefined;
  }

  return completionTokens / (latencyMs / MILLISECONDS_PER_SECOND);
}

function elapsedMs(input: FallbackRunnerInput, startedAtMs: number): number {
  return Math.max(input.nowMs() - startedAtMs, 0);
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
