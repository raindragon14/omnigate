import { describe, expect, test } from "bun:test";

import type { ProviderCandidate, RouterRequest } from "../shared/signatures";
import { rankProviderCandidates, scoreProvider } from "./provider-scorer";

const FREE_HIGH: ProviderCandidate = { id: "alpha", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 90, enabled: true, paidFallback: false, apiKeyEnv: "", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} };
const FREE_LOW: ProviderCandidate = { id: "beta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 80, enabled: true, paidFallback: false, apiKeyEnv: "", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} };
const PAID: ProviderCandidate = { id: "gamma", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 50, enabled: true, paidFallback: true, apiKeyEnv: "", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} };
const NO_TOOLS: ProviderCandidate = { id: "delta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 85, enabled: true, paidFallback: false, apiKeyEnv: "", context: 100000, supportsTools: false, supportsJson: true, supportsStreaming: true, rateLimit: {} };

function makeRequest(overrides: Partial<RouterRequest> = {}): RouterRequest {
  return { messages: [], model: "test", stream: false, mode: "balanced", ...overrides };
}

/** Unit tests for provider scoring and ranking. */
describe("provider scoring", () => {
  describe("scoreProvider", () => {
    test("higher priority scores higher", () => {
      const high = scoreProvider(makeRequest(), FREE_HIGH);
      const low = scoreProvider(makeRequest(), FREE_LOW);

      expect(high.score).toBeGreaterThan(low.score);
    });

    test("includes tiebreaker in score", () => {
      const result = scoreProvider(makeRequest(), FREE_HIGH);

      expect(result.score).toBeGreaterThan(FREE_HIGH.priority);
    });
  });

  describe("rankProviderCandidates", () => {
    test("places higher priority first", () => {
      const ranked = rankProviderCandidates(makeRequest(), [FREE_LOW, FREE_HIGH]);

      expect(ranked[0]!.id).toBe("alpha");
      expect(ranked[1]!.id).toBe("beta");
    });

    test("survival mode penalizes paid providers", () => {
      const ranked = rankProviderCandidates(makeRequest({ mode: "survival" }), [PAID, FREE_LOW]);

      expect(ranked[0]!.id).toBe("beta");
      expect(ranked[1]!.id).toBe("gamma");
    });

    test("quality mode amplifies priority", () => {
      const ranked = rankProviderCandidates(makeRequest({ mode: "quality" }), [FREE_LOW, FREE_HIGH]);

      expect(ranked[0]!.id).toBe("alpha");
      expect(ranked[1]!.id).toBe("beta");
    });

    test("provider with tool support ranks higher when tools requested", () => {
      const ranked = rankProviderCandidates(makeRequest({ tools: [{ type: "function" }] }), [NO_TOOLS, FREE_HIGH]);

      expect(ranked[0]!.id).toBe("alpha");
    });
  });
});
