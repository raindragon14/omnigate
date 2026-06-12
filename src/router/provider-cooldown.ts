import type { ProviderCooldownStore } from "../shared/signatures";

const MILLISECONDS_PER_SECOND = 1_000;
const DEFAULT_COOLDOWN_MS = 60_000;
const RETRY_AFTER_HEADER = "retry-after";

/**
 * Creates an in-memory cooldown store backed by a Map.
 * @returns A ProviderCooldownStore instance.
 */
export function createProviderCooldownStore(): ProviderCooldownStore {
  const cooldowns = new Map<string, number>();

  return {
    getCooldownUntil(providerId: string): number | undefined {
      return cooldowns.get(providerId);
    },

    setCooldown(providerId: string, cooldownUntilMs: number): void {
      cooldowns.set(providerId, cooldownUntilMs);
    },

    isProviderCoolingDown(providerId: string, nowMs: number): boolean {
      const until = cooldowns.get(providerId);

      if (until === undefined) {
        return false;
      }

      return nowMs < until;
    },
  };
}

/**
 * Parses a Retry-After header value into milliseconds from now.
 * Handles both seconds and HTTP-date formats.
 * @param rawHeader  The raw Retry-After header value, or undefined.
 * @param nowMs      Current time in milliseconds.
 * @returns Milliseconds from now to wait, or undefined when unparseable.
 */
export function parseRetryAfterMs(rawHeader: string | undefined, nowMs: number): number | undefined {
  if (rawHeader === undefined || rawHeader.trim() === "") {
    return undefined;
  }

  const trimmed = rawHeader.trim();
  const seconds = Number(trimmed);

  if (Number.isInteger(seconds) && seconds >= 0) {
    return seconds * MILLISECONDS_PER_SECOND;
  }

  const parsedDate = new Date(trimmed).getTime();

  if (!Number.isNaN(parsedDate)) {
    const diff = parsedDate - nowMs;

    return diff > 0 ? diff : undefined;
  }

  return undefined;
}

/**
 * Determines the cooldown duration after a rate-limited response.
 * Uses the Retry-After header when available, otherwise falls back to default.
 * @param headers  The provider response headers.
 * @param nowMs    Current time in milliseconds.
 * @returns The cooldown expiration timestamp in milliseconds.
 */
export function computeCooldownUntil(headers: Record<string, string>, nowMs: number): number {
  const rawRetryAfter = headers[RETRY_AFTER_HEADER];
  const retryAfterMs = parseRetryAfterMs(rawRetryAfter, nowMs);

  return nowMs + (retryAfterMs ?? DEFAULT_COOLDOWN_MS);
}
