import type { ProviderCandidate, ProviderRequest, ProviderResponse, RouterRequest } from "../shared/signatures";
import type { ProviderAdapter } from "./provider-adapter";

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const CONTENT_TYPE_JSON = "application/json";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Creates an adapter that works with any OpenAI-compatible chat API. */
export function createOpenAiCompatibleAdapter(): ProviderAdapter {
  return {
    id: "openai-compatible",
    supports: isSupported,
    transformRequest: buildProviderRequest,
    send: sendProviderRequest,
  };
}

function isSupported(): boolean {
  return true;
}

function buildProviderRequest(request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest {
  return {
    url: `${provider.baseUrl}${CHAT_COMPLETIONS_PATH}`,
    headers: {
      "Content-Type": CONTENT_TYPE_JSON,
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: provider.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: request.stream,
    },
  };
}

async function sendProviderRequest(providerRequest: ProviderRequest): Promise<ProviderResponse> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(providerRequest.url, {
      method: "POST",
      headers: providerRequest.headers,
      body: JSON.stringify(providerRequest.body),
      signal: abortController.signal,
    });

    return {
      status: response.status,
      body: await response.json() as Record<string, unknown>,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
