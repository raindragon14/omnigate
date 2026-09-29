import { readFileSync } from "fs";
import { parse } from "yaml";
import { join } from "path";
import { z } from "zod";

import type {
  AliasProfile,
  ProviderCandidate,
  ProviderCost,
  ProviderRateLimit,
  ProviderRegistry,
} from "../shared/signatures";

const PROVIDER_REGISTRY_PATH = "provider.registry.yaml";
const MIN_SCORE = 0;
const MAX_SCORE = 100;
const REGISTRY_ERROR_PREFIX = "Invalid provider registry";

const rateLimitSchema = z.object({
  rpm: z.number().int().positive().optional(),
  rph: z.number().int().positive().optional(),
  rpd: z.number().int().positive().optional(),
});

const costSchema = z.object({
  input_per_1m: z.number().nonnegative().optional(),
  output_per_1m: z.number().nonnegative().optional(),
  source: z.string().min(1).optional(),
});

const aliasWeightsSchema = z.object({
  speed: z.number().min(0).max(10).optional(),
  quality: z.number().min(0).max(10).optional(),
});

const aliasSchema = z.object({
  families: z.array(z.string().min(1)).min(1),
  allow_paid: z.boolean().optional(),
  weights: aliasWeightsSchema.optional(),
  tiebreak: z.enum(["priority", "speed", "quality"]).optional(),
});

const profileSchema = z.object({
  categories: z.array(z.string().min(1)).min(1),
  min_quality_ratio: z.number().min(0).max(2).optional(),
});

const providerSchema = z.object({
  id: z.string().min(1),
  base_url: z.string().url(),
  model: z.string().min(1),
  api_key_env: z.string().min(1),
  family: z.string().min(1),
  priority: z.number().int(),
  quality_score: z.number().min(MIN_SCORE).max(MAX_SCORE),
  speed_score: z.number().min(MIN_SCORE).max(MAX_SCORE).optional(),
  enabled: z.boolean(),
  paid_fallback: z.boolean().optional(),
  context: z.number().int().nonnegative().optional(),
  supports_tools: z.boolean().optional(),
  supports_json: z.boolean().optional(),
  supports_streaming: z.boolean().optional(),
  supports_reasoning: z.boolean().optional(),
  max_tokens_field: z.enum(["max_tokens", "max_completion_tokens"]).optional(),
  rate_limit: rateLimitSchema.optional(),
  cost: costSchema.optional(),
});

const registrySchema = z.object({
  providers: z.array(providerSchema),
  aliases: z.record(aliasSchema),
  profiles: z.record(profileSchema).optional(),
});

type RawRateLimit = z.infer<typeof rateLimitSchema>;
type RawCost = z.infer<typeof costSchema>;
type RawProfile = z.infer<typeof profileSchema>;
type RawProvider = z.infer<typeof providerSchema>;

let cachedRegistry: ProviderRegistry | undefined;

/**
 * Loads and parses provider.registry.yaml into a typed ProviderRegistry.
 * The result is cached after the first call to avoid repeated disk I/O.
 * @returns The parsed provider registry.
 */
export function loadProviderRegistry(): ProviderRegistry {
  if (cachedRegistry !== undefined) {
    return cachedRegistry;
  }

  const filePath = join(import.meta.dir, PROVIDER_REGISTRY_PATH);
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as unknown;

  cachedRegistry = parseProviderRegistry(parsed);

  return cachedRegistry;
}

/**
 * Validates and converts raw provider registry data into routing candidates.
 * @param rawRegistry  Parsed YAML registry data with unknown shape.
 * @returns A typed ProviderRegistry ready for routing.
 * @throws {Error} When the registry shape is invalid.
 */
export function parseProviderRegistry(rawRegistry: unknown): ProviderRegistry {
  const result = registrySchema.safeParse(rawRegistry);

  if (!result.success) {
    throw new Error(formatRegistryError(result.error));
  }

  assertAliasProfiles(result.data.aliases, result.data.profiles);

  return {
    providers: result.data.providers.map(toProviderCandidate),
    aliases: result.data.aliases,
    profiles: mapProfiles(result.data.profiles),
  };
}

/**
 * Reads an API key from the environment for the given env-var name.
 * @param apiKeyEnv  The name of the environment variable (e.g. "HF_TOKEN").
 * @returns The API key string, or undefined when not set.
 */
export function resolveApiKey(apiKeyEnv: string): string | undefined {
  return Bun.env[apiKeyEnv];
}

/**
 * Resets the cached provider registry so the next call to loadProviderRegistry
 * re-reads the YAML file from disk.  Useful for testing or hot-reload scenarios.
 */
export function resetProviderRegistry(): void {
  cachedRegistry = undefined;
}

/**
 * Maps raw profile config into typed AliasProfile values.
 * @param rawProfiles  Parsed profile records or undefined when absent.
 * @returns A record of alias profiles keyed by alias name.
 */
function mapProfiles(
  rawProfiles: Record<string, RawProfile> | undefined,
): Record<string, AliasProfile> {
  if (rawProfiles === undefined) {
    return {};
  }

  const profiles: Record<string, AliasProfile> = {};

  for (const [name, raw] of Object.entries(rawProfiles)) {
    profiles[name] = {
      categories: raw.categories,
      minQualityRatio: raw.min_quality_ratio,
    };
  }

  return profiles;
}

function toProviderCost(raw: RawCost | undefined): ProviderCost {
  if (raw === undefined) {
    return {};
  }

  return {
    inputPer1m: raw.input_per_1m,
    outputPer1m: raw.output_per_1m,
    source: raw.source,
  };
}
function toRateLimit(raw: RawRateLimit | undefined): ProviderRateLimit {
  if (raw === undefined) {
    return {};
  }

  return {
    rpm: raw.rpm,
    rph: raw.rph,
    rpd: raw.rpd,
  };
}

function toProviderCandidate(raw: RawProvider): ProviderCandidate {
  return {
    id: raw.id,
    baseUrl: raw.base_url,
    model: raw.model,
    family: raw.family,
    priority: raw.priority,
    qualityScore: raw.quality_score,
    speedScore: raw.speed_score,
    enabled: raw.enabled,
    paidFallback: raw.paid_fallback ?? false,
    apiKeyEnv: raw.api_key_env,
    context: raw.context ?? 0,
    supportsTools: raw.supports_tools ?? false,
    supportsJson: raw.supports_json ?? false,
    supportsStreaming: raw.supports_streaming ?? true,
    supportsReasoning: raw.supports_reasoning ?? false,
    maxTokensField: raw.max_tokens_field,
    rateLimit: toRateLimit(raw.rate_limit),
    cost: toProviderCost(raw.cost),
  };
}

function assertAliasProfiles(
  aliases: Record<string, unknown>,
  profiles: Record<string, unknown> | undefined,
): void {
  for (const alias of Object.keys(aliases)) {
    if (profiles?.[alias] === undefined) {
      throw new Error(`${REGISTRY_ERROR_PREFIX}: profiles.${alias} missing`);
    }
  }
}

function formatRegistryError(error: z.ZodError): string {
  const issue = error.issues[0];

  if (issue === undefined) {
    return REGISTRY_ERROR_PREFIX;
  }

  return `${REGISTRY_ERROR_PREFIX}: ${issue.path.join(".") || "root"} ${issue.message}`;
}
