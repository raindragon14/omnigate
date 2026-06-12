import type { ProviderCandidate, ProviderScore, RouterRequest, RoutingMode } from "../shared/signatures";

const MODE_QUALITY_MULTIPLIER = 1.2;
const MODE_SURVIVAL_PAID_PENALTY = 200;

const FEATURE_TOOL_MATCH_BONUS = 20;
const FEATURE_JSON_MATCH_BONUS = 15;
const FEATURE_STREAMING_MATCH_BONUS = 10;

const TIEBREAKER_DIVISOR = 1_000_000;

/**
 * Computes a numeric score for a single provider candidate based on priority,
 * routing mode, and feature match.
 * @param request   The normalised router request.
 * @param provider  The provider candidate to score.
 * @returns A ProviderScore with providerId and score.
 */
export function scoreProvider(request: RouterRequest, provider: ProviderCandidate): ProviderScore {
  let score = provider.priority;

  score = applyModeAdjustment(score, request.mode, provider);
  score = applyFeatureBonus(score, request, provider);

  const scoreWithTiebreaker = score + provider.priority / TIEBREAKER_DIVISOR;

  return { providerId: provider.id, score: scoreWithTiebreaker };
}

/**
 * Ranks provider candidates by descending score, stable for equal scores.
 * @param request    The normalised router request.
 * @param providers  The list of eligible candidates.
 * @returns The candidates sorted from highest to lowest score.
 */
export function rankProviderCandidates(request: RouterRequest, providers: ProviderCandidate[]): ProviderCandidate[] {
  const scored = providers.map((provider) => ({
    provider,
    score: scoreProvider(request, provider).score,
  }));

  scored.sort((first, second) => second.score - first.score);

  return scored.map((entry) => entry.provider);
}

function applyModeAdjustment(score: number, mode: RoutingMode, provider: ProviderCandidate): number {
  if (mode === "quality") {
    return Math.round(score * MODE_QUALITY_MULTIPLIER);
  }

  if (mode === "survival" && provider.paidFallback) {
    return score - MODE_SURVIVAL_PAID_PENALTY;
  }

  return score;
}

function applyFeatureBonus(score: number, request: RouterRequest, provider: ProviderCandidate): number {
  let bonus = 0;

  if (request.tools !== undefined && request.tools.length > 0 && provider.supportsTools) {
    bonus += FEATURE_TOOL_MATCH_BONUS;
  }

  if (request.responseFormat !== undefined && provider.supportsJson) {
    bonus += FEATURE_JSON_MATCH_BONUS;
  }

  if (request.stream && provider.supportsStreaming) {
    bonus += FEATURE_STREAMING_MATCH_BONUS;
  }

  return score + bonus;
}
