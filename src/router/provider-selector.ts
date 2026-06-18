import type { ProviderCandidate, ProviderSelectionInput } from "../shared/signatures";

/**
 * Filters and returns eligible provider candidates for the given request.
 * Rejects disabled providers, providers outside the alias family, providers
 * with missing API keys, paid fallback unless explicitly allowed, providers
 * in active cooldown, and providers missing required feature support.
 * @param input  Selection parameters (request, registry, cooldowns, keys).
 * @returns An array of eligible ProviderCandidate values (empty when none match).
 */
export function selectProviderCandidates(input: ProviderSelectionInput): ProviderCandidate[] {
  const { request, providers, aliases, cooldownStore, resolveApiKey, nowMs } = input;
  const aliasConfig = aliases[request.model];

  if (aliasConfig === undefined) {
    return [];
  }

  const shouldAllowPaid = aliasConfig.allow_paid === true;
  const shouldRequireTools = request.tools !== undefined && request.tools.length > 0;
  const shouldRequireJson = request.responseFormat !== undefined;

  return providers.filter((provider) => isProviderEligible(provider, {
    input,
    shouldAllowPaid,
    shouldRequireTools,
    shouldRequireJson,
  }));
}

type ProviderEligibilityOptions = {
  input: ProviderSelectionInput;
  shouldAllowPaid: boolean;
  shouldRequireTools: boolean;
  shouldRequireJson: boolean;
};

function isProviderEligible(provider: ProviderCandidate, options: ProviderEligibilityOptions): boolean {
  const { input, shouldAllowPaid, shouldRequireTools, shouldRequireJson } = options;
  const { request, aliases, cooldownStore, resolveApiKey, nowMs } = input;
  const aliasConfig = aliases[request.model];

  if (aliasConfig === undefined || !aliasConfig.families.includes(provider.family)) {
    return false;
  }

  if (!provider.enabled || !hasProviderApiKey(provider, resolveApiKey)) {
    return false;
  }

  if (!shouldAllowPaid && provider.paidFallback) {
    return false;
  }

  if (cooldownStore.isProviderCoolingDown(provider.id, nowMs)) {
    return false;
  }

  return canProviderServeFeatures(provider, request, shouldRequireTools, shouldRequireJson);
}

function hasProviderApiKey(
  provider: ProviderCandidate,
  resolveApiKey: (apiKeyEnv: string) => string | undefined,
): boolean {
  const apiKey = resolveApiKey(provider.apiKeyEnv);

  return apiKey !== undefined && apiKey !== "";
}

function canProviderServeFeatures(
  provider: ProviderCandidate,
  request: ProviderSelectionInput["request"],
  shouldRequireTools: boolean,
  shouldRequireJson: boolean,
): boolean {
  if (shouldRequireTools && !provider.supportsTools) {
    return false;
  }

  if (shouldRequireJson && !provider.supportsJson) {
    return false;
  }

  return !request.stream || provider.supportsStreaming;
}
