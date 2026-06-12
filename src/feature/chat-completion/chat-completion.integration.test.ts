import { beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { createApp } from "../../app";
import { HTTP_STATUS_BAD_REQUEST } from "../../shared/http-status";

const CHAT_COMPLETION_PATH = "/v1/chat/completions";
const PROVIDER_API_KEY_ENV_NAMES = [
  "OPENCODE_API_KEY",
  "OPENROUTER_API_KEY",
  "KILO_API_KEY",
  "HF_TOKEN",
  "NOUS_API_KEY",
  "DEEPSEEK_API_KEY",
];

let app: Hono;

beforeAll(() => {
  app = createApp();
});

/** Integration tests for the POST /v1/chat/completions endpoint. */
describe("chat completion integration", () => {
  /** Should return 400 when the request body is empty. */
  test("returns 400 for empty body", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when the model field is missing. */
  test("returns 400 for missing model", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when the messages array is empty. */
  test("returns 400 for empty messages", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test", messages: [] }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when a message has an invalid role value. */
  test("rejects invalid role", async () => {
    const response = await app.request(CHAT_COMPLETION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test", messages: [{ role: "invalid", content: "hi" }] }),
    });

    expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
  });

  /** Should return 400 when no provider has a configured API key for the requested model. */
  test("returns client error for valid request when no provider has API keys", async () => {
    const response = await withClearedProviderApiKeys(async () => {
      return app.request(CHAT_COMPLETION_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
