import { beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { createApp } from "../../app";
import { DEFAULT_PORT } from "../../config/config-loader";
import { loadProviderRegistry } from "../../config/provider-loader";
import type { ProviderAdapter } from "../../provider/provider-adapter";
import { configureChatCompletionLogging } from "./chat-completion.service";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_UNAUTHORIZED } from "../../shared/http-status";

const CHAT_COMPLETION_PATH = "/v1/chat/completions";
const TEST_OMNIGATE_API_KEY = "test-omnigate-key";
const AUTH_HEADERS = {
  Authorization: `Bearer ${TEST_OMNIGATE_API_KEY}`,
  "Content-Type": "application/json",
};
const TEST_APP_CONFIG = {
  port: DEFAULT_PORT,
  omnigateApiKey: TEST_OMNIGATE_API_KEY,
  databasePath: ":memory:",
  logBodies: false,
};
const PROVIDER_API_KEY_ENV_NAMES = [
  ...new Set(loadProviderRegistry().providers.map((p) => p.apiKeyEnv)),
];

let app: Hono;

beforeAll(() => {
  app = createApp(TEST_APP_CONFIG);
});

/** Integration tests for the POST /v1/chat/completions endpoint. */
describe("chat completion integration", () => {
  /** Should return 400 when the request body is empty. */
  test("returns 400 for empty body", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should attach a request id to chat completion responses. */
  test("attaches a request id to chat completion responses", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({}),
    });

    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  /** Should return 400 when the model field is missing. */
  test("returns 400 for missing model", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when the messages array is empty. */
  test("returns 400 for empty messages", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ model: "test", messages: [] }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when a message has an invalid role value. */
  test("rejects invalid role", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ model: "test", messages: [{ role: "invalid", content: "hi" }] }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should accept the developer role (normalised to system before routing). */
  test("accepts developer role", async () => {
    const response = await withClearedProviderApiKeys(async () => {
      return app.request(CHAT_COMPLETION_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          model: "omnigate/auto",
          messages: [{ role: "developer", content: "hi" }],
        }),
      });
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);

    const body = await response.json();

    expect(body.error.message).toContain("No available provider");
  });

  /** Should return 400 when reasoning_effort is not a known enum value. */
  test("rejects invalid reasoning_effort", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        model: "omnigate/auto",
        messages: [{ role: "user", content: "hi" }],
        reasoning_effort: "extreme",
      }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when no provider has a configured API key for the requested model. */
  test("returns client error for valid request when no provider has API keys", async () => {
    const response = await withClearedProviderApiKeys(async () => {
      return app.request(CHAT_COMPLETION_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          model: "omnigate/auto",
          messages: [{ role: "user", content: "hi" }],
        }),
      });
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);

    const body = await response.json();

    expect(body.error).toBeDefined();
  });

  /** Should accept text-only OpenAI content-part arrays and route them as text. */
  test("accepts text-only content-part arrays", async () => {
    const response = await withClearedProviderApiKeys(async () => {
      return app.request(CHAT_COMPLETION_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          model: "omnigate/auto",
          messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        }),
      });
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);

    const body = await response.json();

    expect(body.error.message).toContain("No available provider");
  });

  /** Should reject real multimodal content with a clear client error. */
  test("rejects multimodal content-part arrays", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        model: "omnigate/auto",
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: "https://example.com/image.png" } }],
          },
        ],
      }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);

    const body = await response.json();

    expect(body.error.message).toContain("Only text message content parts are supported");
  });

  /** Should require OmniGate API key auth before request validation. */
  test("returns 401 for missing auth", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  /** Should reject an incorrect OmniGate API key. */
  test("returns 401 for invalid auth", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: { ...AUTH_HEADERS, Authorization: "Bearer wrong-key" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  describe("body logging", () => {
    /** Should log request bodies when enabled. */
    test("logs request bodies when enabled", async () => {
      const loggingApp = createApp({ ...TEST_APP_CONFIG, logBodies: true });

      try {
        const lines = await captureLogs(async () => {
          await withClearedProviderApiKeys(async () =>
            loggingApp.request(CHAT_COMPLETION_PATH, {
              method: "POST",
              headers: AUTH_HEADERS,
              body: JSON.stringify({
                model: "omnigate/auto",
                messages: [{ role: "user", content: "hi" }],
              }),
            }),
          );
        });

        const requestLines = lines.filter((line) => line.includes('"direction":"request"'));

        expect(requestLines).toHaveLength(1);
        expect(requestLines[0]).toContain("omnigate/auto");
      } finally {
        configureChatCompletionLogging(false);
      }
    });

    /** Should skip body logs when disabled. */
    test("skips body logs when disabled", async () => {
      const lines = await captureLogs(async () => {
        await app.request(CHAT_COMPLETION_PATH, {
          method: "POST",
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        });
      });

      expect(lines.some((line) => line.includes('"direction"'))).toBe(false);
    });

    /** Should note that stream bodies pass through uncaptured. */
    test("logs stream passthrough note when enabled", async () => {
      const loggingApp = createApp({ ...TEST_APP_CONFIG, logBodies: true }, createStreamAdapter());

      try {
        const lines = await captureLogs(async () => {
          await withProviderApiKeys(async () => {
            const response = await loggingApp.request(CHAT_COMPLETION_PATH, {
              method: "POST",
              headers: AUTH_HEADERS,
              body: JSON.stringify({
                model: "omnigate/auto",
                messages: [{ role: "user", content: "hi" }],
                stream: true,
              }),
            });

            await response.body?.cancel();
          });
        });

        expect(lines.some((line) => line.includes("passed through, not captured"))).toBe(true);
      } finally {
        configureChatCompletionLogging(false);
      }
    });
  });

  describe("request id correlation", () => {
    /** Should match the response header with the logged request id. */
    test("matches response header with logged request id", async () => {
      let headerId: string | null = null;

      const lines = await captureLogs(async () => {
        await withClearedProviderApiKeys(async () => {
          const response = await app.request(CHAT_COMPLETION_PATH, {
            method: "POST",
            headers: AUTH_HEADERS,
            body: JSON.stringify({
              model: "omnigate/auto",
              messages: [{ role: "user", content: "hi" }],
            }),
          });

          headerId = response.headers.get("x-request-id");

          return response;
        });
      });

      expect(headerId).not.toBeNull();

      if (headerId === null) {
        expect.unreachable("missing x-request-id header");
      }

      const summaryLine = lines.find((line) => line.includes('"route":"/v1/chat/completions"'));

      expect(summaryLine).toBeDefined();
      expect((JSON.parse(summaryLine!) as { request_id: string }).request_id).toBe(headerId);
    });
  });
});

async function captureLogs(callback: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  try {
    await callback();
  } finally {
    console.log = originalLog;
  }

  return lines;
}

async function withClearedProviderApiKeys<TValue>(
  callback: () => Promise<TValue>,
): Promise<TValue> {
  const originalValues = new Map<string, string | undefined>();

  for (const name of PROVIDER_API_KEY_ENV_NAMES) {
    originalValues.set(name, Bun.env[name]);
    delete Bun.env[name];
  }

  try {
    return await callback();
  } finally {
    for (const [name, value] of originalValues) {
      if (value === undefined) {
        delete Bun.env[name];
      } else {
        Bun.env[name] = value;
      }
    }
  }
}

async function withProviderApiKeys<TValue>(callback: () => Promise<TValue>): Promise<TValue> {
  const originalValues = new Map<string, string | undefined>();

  for (const name of PROVIDER_API_KEY_ENV_NAMES) {
    originalValues.set(name, Bun.env[name]);
    Bun.env[name] = "test-provider-key";
  }

  try {
    return await callback();
  } finally {
    for (const [name, value] of originalValues) {
      if (value === undefined) {
        delete Bun.env[name];
      } else {
        Bun.env[name] = value;
      }
    }
  }
}

function createStreamAdapter(): ProviderAdapter {
  return {
    id: "mock-stream",
    supports: () => true,
    transformRequest: (request, provider) => ({
      url: provider.baseUrl,
      headers: {},
      body: { model: provider.model, stream: request.stream },
    }),
    send: async () => {
      throw new Error("Mock stream adapter does not support JSON sends");
    },
    sendStream: async () => ({
      status: 200,
      headers: {},
      stream: streamFromText('data: {"choices":[]}\n\n'),
    }),
  };
}

function streamFromText(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}
