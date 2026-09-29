import { describe, expect, test } from "bun:test";

import { RoutingError } from "../feature/chat-completion/chat-completion.service";
import { checkQualityBar, enforceProfileScope } from "./profile-guard";
import type { AliasProfile } from "../shared/signatures";

const PROFILES: Record<string, AliasProfile> = {
  "omnigate/auto": {
    categories: ["knowledge", "coding", "writing", "chat"],
    minQualityRatio: 0.85,
  },
  "omnigate/code-fast": { categories: ["coding"], minQualityRatio: 0.75 },
};

describe("profile guard", () => {
  test("allows in-scope categories", () => {
    expect(() => enforceProfileScope("omnigate/code-fast", "coding", PROFILES)).not.toThrow();
  });

  test("rejects out-of-scope categories with a fallback hint", () => {
    try {
      enforceProfileScope("omnigate/code-fast", "writing", PROFILES);
      throw new Error("expected RoutingError");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingError);
      expect((error as RoutingError).code).toBe("profile_scope_mismatch");
      expect((error as RoutingError).message).toContain("omnigate/auto");
    }
  });

  test("auto never rejects scope", () => {
    for (const category of ["knowledge", "coding", "writing", "chat"] as const) {
      expect(() => enforceProfileScope("omnigate/auto", category, PROFILES)).not.toThrow();
    }
  });

  test("unknown model without a profile is allowed", () => {
    expect(() => enforceProfileScope("omnigate/unknown", "coding", PROFILES)).not.toThrow();
  });

  test("quality bar passes at or above the ratio", () => {
    expect(checkQualityBar(95, 100, 0.95)).toBe(true);
    expect(checkQualityBar(85, 100, 0.85)).toBe(true);
  });

  test("quality bar misses below the ratio", () => {
    expect(checkQualityBar(84, 100, 0.85)).toBe(false);
  });

  test("quality bar passes when inputs are unknown", () => {
    expect(checkQualityBar(undefined, 100, 0.85)).toBe(true);
    expect(checkQualityBar(85, undefined, 0.85)).toBe(true);
    expect(checkQualityBar(85, 100, undefined)).toBe(true);
  });
});
