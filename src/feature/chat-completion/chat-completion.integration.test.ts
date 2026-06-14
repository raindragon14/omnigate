import { beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { createApp } from "../../app";
import { DEFAULT_PORT } from "../../config/config-loader";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_UNAUTHORIZED } from "../../shared/http-status";

const CHAT_COMPLETION_PATH = "/v1/chat/completions";
const TEST_OMNIGATE_API_KEY = "test-omnigate-key";
const AUTH_HEADERS = {
  Authorization: `Bearer ${TEST_OMNIGATE_API_KEY}`,
  "Content-Type": "application/json",
};
const TEST_APP_CONFIG = { port: DEFAULT_PORT, omnigateApiKey: TEST_OMNIGATE_API_KEY, databasePath: ":memory:" };
const PROVIDER_API_KEY_ENV_NAMES = [
  "OPENCODE_API_KEY",
  "OPENROUTER_API_KEY",
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

  /** Should return 400 when no provider has a configured API key for the requested model. */
  test("returns client error for valid request when no provider has API keys", async () => {
    const response = await withClearedProviderApiKeys(async () => {
      return app.request(CHAT_COMPLETION_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          model: "omnigate/deepseek-v4-flash-auto",
          messages: [{ role: "user", content: "hi" }],
        }),
      });
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);

    const body = await response.json();

    expect(body.error).toBeDefined();
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
});

async function withClearedProviderApiKeys<TValue>(callback: () => Promise<TValue>): Promise<TValue> {
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
