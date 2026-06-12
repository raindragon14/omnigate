import { readFileSync } from "fs";
import { parse } from "yaml";
import { join } from "path";

import type { AliasConfig, ProviderCandidate, ProviderRegistry } from "../shared/signatures";

const PROVIDER_REGISTRY_PATH = "provider.registry.yaml";

type RawProvider = {
  id: string;
  base_url: string;
  model: string;
  api_key_env: string;
  family: string;
  priority: number;
  enabled: boolean;
  paid_fallback?: boolean;
};

type RawRegistry = {
  providers: RawProvider[];
  aliases: Record<string, AliasConfig>;
};

let cachedRegistry: ProviderRegistry | undefined;

/** Loads and parses provider.registry.yaml into a typed ProviderRegistry (cached after first call). */
export function loadProviderRegistry(): ProviderRegistry {
  if (cachedRegistry !== undefined) {
    return cachedRegistry;
  }

  const filePath = join(import.meta.dir, PROVIDER_REGISTRY_PATH);
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as RawRegistry;

  cachedRegistry = {
    providers: parsed.providers.map(toProviderCandidate),
    aliases: parsed.aliases,
  };

  return cachedRegistry;
}

/** Reads an API key from the environment for the given env-var name. */
export function resolveApiKey(apiKeyEnv: string): string | undefined {
  return Bun.env[apiKeyEnv];
}

/** Resets the cached registry (useful for testing or hot-reload). */
export function resetProviderRegistry(): void {
  cachedRegistry = undefined;
}

function toProviderCandidate(raw: RawProvider): ProviderCandidate {
  return {
    id: raw.id,
    baseUrl: raw.base_url,
    model: raw.model,
    family: raw.family,
    priority: raw.priority,
    enabled: raw.enabled,
    paidFallback: raw.paid_fallback ?? false,
    apiKeyEnv: raw.api_key_env,
  };
}
