import type { EvalItem, RouterAttempt, RouterFn } from "./types";

const LIVE_REQUEST_TIMEOUT_MS = 120_000;
const LIVE_MAX_COMPLETION_TOKENS = 256;

/**
 * Creates a deterministic pseudo-random generator (mulberry32).
 * Random-router runs are reproducible for a given seed.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fixed router: always returns the same answer. Lower baseline for
 * harness self-tests; pass an abstention to exercise not_attempted.
 */
export function createFixedRouter(answer: string): RouterFn {
  return () => ({ answer });
}

/**
 * Oracle router (offline upper bound, not production-realistic): returns the
 * first accepted answer for every item.
 */
export function createOracleRouter(): RouterFn {
  return (item: EvalItem) => ({ answer: item.answers[0] ?? "" });
}

/**
 * Random router (simple lower baseline): picks uniformly from the pool.
 * Deterministic for a given seed.
 */
export function createRandomRouter(pool: string[], seed: number): RouterFn {
  const random = createSeededRandom(seed);

  return () => {
    if (pool.length === 0) {
      return { answer: "" };
    }

    const index = Math.floor(random() * pool.length);

    return { answer: pool[index] ?? "" };
  };
}

export type LiveRouterOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

/**
 * Live router: sends each question to a running OmniGate gateway and
 * returns the assistant message. Per-item failures throw so the harness
 * records them as errors instead of silently scoring them.
 */
export function createOmnigateLiveRouter(options: LiveRouterOptions): RouterFn {
  return async (item: EvalItem): Promise<RouterAttempt> => {
    const startedAtMs = Date.now();

    const response = await fetch(`${options.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: item.question }],
        max_tokens: LIVE_MAX_COMPLETION_TOKENS,
      }),
      signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`live router HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = body.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("live router returned a malformed response");
    }

    return { answer: content, latencyMs: Date.now() - startedAtMs };
  };
}
