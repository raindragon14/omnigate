import { describe, expect, test } from "bun:test";

import type { ProviderCandidate, ProviderStatsRecord, RouterRequest } from "../shared/signatures";
import { rankProviderCandidates, scoreProvider } from "./provider-scorer";

const FAMILY = "deepseek-v4-flash";
const DAY = "2026-01-02";

function makeProvider(overrides: Partial<ProviderCandidate> = {}): ProviderCandidate {
  return {
    id: "alpha",
    baseUrl: "",
    model: "",
    family: FAMILY,
    priority: 80,
    qualityScore: 80,
    speedScore: 80,
    enabled: true,
    paidFallback: false,
    apiKeyEnv: "",
    context: 100000,
    supportsTools: true,
    supportsJson: true,
    supportsStreaming: true,
    rateLimit: {},
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RouterRequest> = {}): RouterRequest {
  return { messages: [], model: "test", stream: false, mode: "balanced", ...overrides };
}

function makeStats(overrides: Partial<ProviderStatsRecord> = {}): ProviderStatsRecord {
  return {
    providerId: "alpha",
    modelFamily: FAMILY,
    day: DAY,
    requestCount: 10,
    tokenCount: 1000,
    successCount: 10,
    failureCount: 0,
    rateLimitCount: 0,
    avgLatencyMs: 1000,
    avgTokensPerSecond: 70,
    ...overrides,
  };
}

/** Unit tests for provider scoring and ranking. */
describe("provider scoring", () => {
  describe("scoreProvider", () => {
    test("uses configured speed score", () => {
      const fast = scoreProvider({ request: makeRequest({ mode: "speed" }), provider: makeProvider({ speedScore: 90 }) });
      const slow = scoreProvider({ request: makeRequest({ mode: "speed" }), provider: makeProvider({ speedScore: 40 }) });

      expect(fast.score).toBeGreaterThan(slow.score);
    });

    test("uses configured quality score", () => {
      const strong = scoreProvider({ request: makeRequest({ mode: "quality" }), provider: makeProvider({ qualityScore: 95 }) });
      const weak = scoreProvider({ request: makeRequest({ mode: "quality" }), provider: makeProvider({ qualityScore: 50 }) });

      expect(strong.score).toBeGreaterThan(weak.score);
    });

    test("uses observed tokens per second when stats exist", () => {
      const fast = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ avgTokensPerSecond: 90 }) });
      const slow = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ avgTokensPerSecond: 20 }) });

      expect(fast.score).toBeGreaterThan(slow.score);
    });

    test("uses lower latency as a positive signal", () => {
      const quick = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ avgLatencyMs: 500 }) });
      const delayed = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ avgLatencyMs: 2500 }) });

      expect(quick.score).toBeGreaterThan(delayed.score);
    });

    test("uses time-to-first-token for streaming latency", () => {
      const quick = scoreProvider({ request: makeRequest({ stream: true }), provider: makeProvider(), stats: makeStats({ avgTimeToFirstTokenMs: 200 }) });
      const delayed = scoreProvider({ request: makeRequest({ stream: true }), provider: makeProvider(), stats: makeStats({ avgTimeToFirstTokenMs: 2000 }) });

      expect(quick.score).toBeGreaterThan(delayed.score);
    });

    test("penalizes high failure ratio", () => {
      const reliable = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ failureCount: 0 }) });
      const failing = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ failureCount: 8 }) });

      expect(reliable.score).toBeGreaterThan(failing.score);
    });

    test("penalizes high rate-limit ratio", () => {
      const available = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ rateLimitCount: 0 }) });
      const limited = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ rateLimitCount: 8 }) });

      expect(available.score).toBeGreaterThan(limited.score);
    });

    test("softens penalties for low sample counts", () => {
      const lowSample = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ requestCount: 1, failureCount: 1 }) });
      const fullSample = scoreProvider({ request: makeRequest(), provider: makeProvider(), stats: makeStats({ requestCount: 5, failureCount: 5 }) });

      expect(lowSample.score).toBeGreaterThan(fullSample.score);
    });

    test("applies daily quota pressure when configured", () => {
      const open = scoreProvider({ request: makeRequest(), provider: makeProvider({ rateLimit: { rpd: 100 } }), stats: makeStats({ requestCount: 10 }) });
      const used = scoreProvider({ request: makeRequest(), provider: makeProvider({ rateLimit: { rpd: 100 } }), stats: makeStats({ requestCount: 90 }) });

      expect(open.score).toBeGreaterThan(used.score);
    });

    test("keeps feature bonuses", () => {
      const withTools = scoreProvider({ request: makeRequest({ tools: [{ type: "function" }] }), provider: makeProvider({ supportsTools: true }) });
      const withoutTools = scoreProvider({ request: makeRequest({ tools: [{ type: "function" }] }), provider: makeProvider({ supportsTools: false }) });

      expect(withTools.score).toBeGreaterThan(withoutTools.score);
    });
  });

  describe("rankProviderCandidates", () => {
    test("speed mode prefers faster observed provider", () => {
      const fast = makeProvider({ id: "fast", speedScore: 70 });
      const slow = makeProvider({ id: "slow", speedScore: 90 });
      const ranked = rankProviderCandidates({
        request: makeRequest({ mode: "speed" }),
        providers: [slow, fast],
        statsByProviderId: {
          fast: makeStats({ providerId: "fast", avgTokensPerSecond: 90 }),
          slow: makeStats({ providerId: "slow", avgTokensPerSecond: 10 }),
        },
      });

      expect(ranked[0]!.id).toBe("fast");
    });

    test("quality mode prefers higher quality provider", () => {
      const highQuality = makeProvider({ id: "quality", qualityScore: 95, speedScore: 60 });
      const highSpeed = makeProvider({ id: "speed", qualityScore: 50, speedScore: 95 });
      const ranked = rankProviderCandidates({ request: makeRequest({ mode: "quality" }), providers: [highSpeed, highQuality] });

      expect(ranked[0]!.id).toBe("quality");
    });

    test("balanced mode can promote provider with better measured speed", () => {
      const providerA = makeProvider({ id: "provider_a", speedScore: 85, qualityScore: 90 });
      const providerB = makeProvider({ id: "provider_b", speedScore: 80, qualityScore: 86 });
      const ranked = rankProviderCandidates({
        request: makeRequest(),
        providers: [providerA, providerB],
        statsByProviderId: {
          provider_a: makeStats({ providerId: "provider_a", avgTokensPerSecond: 20 }),
          provider_b: makeStats({ providerId: "provider_b", avgTokensPerSecond: 90 }),
        },
      });

      expect(ranked[0]!.id).toBe("provider_b");
    });

    test("survival mode prefers reliable provider", () => {
      const reliable = makeProvider({ id: "reliable", qualityScore: 70, speedScore: 70 });
      const failing = makeProvider({ id: "failing", qualityScore: 95, speedScore: 95 });
      const ranked = rankProviderCandidates({
        request: makeRequest({ mode: "survival" }),
        providers: [failing, reliable],
        statsByProviderId: {
          reliable: makeStats({ providerId: "reliable", failureCount: 0, rateLimitCount: 0 }),
          failing: makeStats({ providerId: "failing", failureCount: 8, rateLimitCount: 8 }),
        },
      });

      expect(ranked[0]!.id).toBe("reliable");
    });

    test("missing stats still ranks by configured scores", () => {
      const high = makeProvider({ id: "high", speedScore: 90, qualityScore: 90 });
      const low = makeProvider({ id: "low", speedScore: 50, qualityScore: 50 });
      const ranked = rankProviderCandidates({ request: makeRequest(), providers: [low, high] });

      expect(ranked[0]!.id).toBe("high");
    });

    test("survival mode penalizes paid providers", () => {
      const paid = makeProvider({ id: "paid", paidFallback: true, speedScore: 100, qualityScore: 100 });
      const free = makeProvider({ id: "free", speedScore: 50, qualityScore: 50 });
      const ranked = rankProviderCandidates({ request: makeRequest({ mode: "survival" }), providers: [paid, free] });

      expect(ranked[0]!.id).toBe("free");
    });
  });
});
