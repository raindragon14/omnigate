import type {
  ProviderCandidate,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamResponse,
  RouterRequest,
} from "../shared/signatures";
import type { ProviderAdapter } from "./provider-adapter";

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const CONTENT_TYPE_JSON = "application/json";
const DEFAULT_TIMEOUT_MS = 30_000;

export type OpenAiCompatibleAdapterOptions = {
  /** Optional fetch implementation; defaults to global `fetch`. */
  fetch?: typeof fetch;
};

/**
 * Creates an adapter that works with any OpenAI-compatible chat API.
 * The adapter builds requests at `{baseUrl}/chat/completions` with a Bearer
 * token Authorization header and a 30-second timeout via AbortController.
 * @param options  Optional adapter configuration.
 * @returns A configured ProviderAdapter instance.
 */
export function createOpenAiCompatibleAdapter(options: OpenAiCompatibleAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;

  return {
    id: "openai-compatible",
    supports: isSupported,
    transformRequest: buildProviderRequest,
    send: (request) => sendProviderRequest(request, fetchImpl),
    sendStream: (request) => sendProviderStreamRequest(request, fetchImpl),
  };
}

function isSupported(): boolean {
  return true;
}

function buildProviderRequest(request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    top_p: request.topP,
    stream: request.stream,
  };

  if (request.tools !== undefined) {
    body.tools = request.tools;
  }

  if (request.toolChoice !== undefined) {
    body.tool_choice = request.toolChoice;
  }

  if (request.responseFormat !== undefined) {
    body.response_format = request.responseFormat;
  }

  return {
    url: `${provider.baseUrl}${CHAT_COMPLETIONS_PATH}`,
    headers: {
      "Content-Type": CONTENT_TYPE_JSON,
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  };
}

async function sendProviderRequest(
  providerRequest: ProviderRequest,
  fetchImpl: typeof fetch,
): Promise<ProviderResponse> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchProviderResponse(providerRequest, fetchImpl, abortController);

    return await toProviderResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendProviderStreamRequest(
  providerRequest: ProviderRequest,
  fetchImpl: typeof fetch,
): Promise<ProviderStreamResponse> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchProviderResponse(providerRequest, fetchImpl, abortController);

    return toProviderStreamResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

function fetchProviderResponse(
  providerRequest: ProviderRequest,
  fetchImpl: typeof fetch,
  abortController: AbortController,
): Promise<Response> {
  return fetchImpl(providerRequest.url, {
    method: "POST",
    headers: providerRequest.headers,
    body: JSON.stringify(providerRequest.body),
    signal: abortController.signal,
  });
}

async function toProviderResponse(response: Response): Promise<ProviderResponse> {
  const parseResult = await parseResponseBody(response);

  return {
    status: response.status,
    body: parseResult.body,
    headers: collectResponseHeaders(response),
    isMalformed: parseResult.isMalformed,
  };
}

function collectResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return headers;
}

function toProviderStreamResponse(response: Response): ProviderStreamResponse {
  return {
    status: response.status,
    headers: collectResponseHeaders(response),
    stream: response.body ?? undefined,
  };
}

async function parseResponseBody(response: Response): Promise<{ body: Record<string, unknown>; isMalformed: boolean }> {
  try {
    return { body: await response.json() as Record<string, unknown>, isMalformed: false };
  } catch {
    return { body: {}, isMalformed: true };
  }
}
