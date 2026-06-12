import { describe, expect, test } from "bun:test";

import { computeCooldownUntil, createProviderCooldownStore, parseRetryAfterMs } from "./provider-cooldown";

const NOW_MS = 1_000_000;

/** Unit tests for cooldown store and Retry-After parsing. */
describe("provider cooldown", () => {
  describe("createProviderCooldownStore", () => {
    test("returns false for unknown provider", () => {
      const store = createProviderCooldownStore();

      expect(store.isProviderCoolingDown("unknown", NOW_MS)).toBe(false);
    });

    test("returns true for provider in cooldown", () => {
      const store = createProviderCooldownStore();

      store.setCooldown("alpha", NOW_MS + 60_000);
      expect(store.isProviderCoolingDown("alpha", NOW_MS)).toBe(true);
    });

    test("returns false after cooldown expires", () => {
      const store = createProviderCooldownStore();

      store.setCooldown("alpha", NOW_MS - 1);
      expect(store.isProviderCoolingDown("alpha", NOW_MS)).toBe(false);
    });

    test("getCooldownUntil returns undefined for unknown provider", () => {
      const store = createProviderCooldownStore();

      expect(store.getCooldownUntil("unknown")).toBeUndefined();
    });

    test("getCooldownUntil returns set value", () => {
      const store = createProviderCooldownStore();

      store.setCooldown("alpha", 12345);
      expect(store.getCooldownUntil("alpha")).toBe(12345);
    });
  });

  describe("parseRetryAfterMs", () => {
    test("returns undefined for missing header", () => {
      expect(parseRetryAfterMs(undefined, NOW_MS)).toBeUndefined();
    });

    test("returns undefined for empty header", () => {
      expect(parseRetryAfterMs("", NOW_MS)).toBeUndefined();
    });

    test("parses seconds", () => {
      const result = parseRetryAfterMs("120", NOW_MS);

      expect(result).toBe(120_000);
    });

    test("parses zero seconds", () => {
      const result = parseRetryAfterMs("0", NOW_MS);

      expect(result).toBe(0);
    });

    test("returns undefined for past HTTP date", () => {
      const pastDate = new Date(NOW_MS - 10_000).toUTCString();

      expect(parseRetryAfterMs(pastDate, NOW_MS)).toBeUndefined();
    });

    test("returns undefined for invalid value", () => {
      expect(parseRetryAfterMs("not-a-date-or-number", NOW_MS)).toBeUndefined();
    });
  });

  describe("computeCooldownUntil", () => {
    test("uses Retry-After seconds from header", () => {
      const result = computeCooldownUntil({ "retry-after": "30" }, NOW_MS);

      expect(result).toBe(NOW_MS + 30_000);
    });

    test("uses default cooldown when no Retry-After header", () => {
      const result = computeCooldownUntil({}, NOW_MS);

      expect(result).toBe(NOW_MS + 60_000);
    });
  });
});
