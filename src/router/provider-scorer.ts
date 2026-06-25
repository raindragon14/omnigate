import type {
  AliasConfig,
  ProviderCandidate,
  ProviderRankingInput,
  ProviderScore,
  ProviderScoringInput,
  ProviderStatsRecord,
  RouterRequest,
  RoutingMode,
  TiebreakMode,
} from "../shared/signatures";

const MIN_SCORE = 0;
const MAX_SCORE = 100;
const DEFAULT_SPEED_SCORE = 50;
const TARGET_TOKENS_PER_SECOND = 70;
const LATENCY_REFERENCE_MS = 3_000;
const MIN_REQUESTS_FOR_FULL_CONFIDENCE = 5;

const FEATURE_TOOL_MATCH_BONUS = 20;
const FEATURE_JSON_MATCH_BONUS = 15;
const FEATURE_STREAMING_MATCH_BONUS = 10;

const FAILURE_PENALTY_WEIGHT = 100;
const RATE_LIMIT_PENALTY_WEIGHT = 120;
const DAILY_QUOTA_PENALTY_WEIGHT = 80;
const MODE_SURVIVAL_PAID_PENALTY = 200;
const TIEBREAKER_DIVISOR = 1_000_000;

type ScoringWeights = {
  configuredSpeed: number;
  configuredQuality: number;
  observedSpeed: number;
  latency: number;
  reliabilityPenalty: number;
  rateLimitPenalty: number;
  quotaPenalty: number;
};

/**
 * Computes a numeric score for a single provider candidate using configured
 * scores, request mode, feature support, and optional persisted stats.
 * @param input  Provider scoring inputs.
 * @returns A ProviderScore with providerId and score.
 */
export function scoreProvider(input: ProviderScoringInput): ProviderScore {
  const { request, provider, stats, aliasConfig } = input;
  const weights = getScoringWeights(request.mode, aliasConfig);
  const score = calculateWeightedScore(request, provider, stats, weights);
  const tiebreakMode = aliasConfig?.tiebreak ?? "priority";

  return { providerId: provider.id, score: applyTiebreaker(score, provider, tiebreakMode, stats) };
}

/**
 * Ranks provider candidates by descending stats-aware score.
 * @param input  Provider ranking inputs.
 * @returns Provider candidates sorted from highest to lowest score.
 */
export function rankProviderCandidates(input: ProviderRankingInput): ProviderCandidate[] {
  const scored = input.providers.map((provider) => ({
    provider,
    score: scoreProvider({
      request: input.request,
      provider,
      stats: input.statsByProviderId?.[provider.id],
      aliasConfig: input.aliasConfig,
    }).score,
  }));

  scored.sort((first, second) => second.score - first.score);

  return scored.map((entry) => entry.provider);
}

function calculateWeightedScore(
  request: RouterRequest,
  provider: ProviderCandidate,
  stats: ProviderStatsRecord | undefined,
  weights: ScoringWeights,
): number {
  return (
    getConfiguredSpeedScore(provider) * weights.configuredSpeed +
    provider.qualityScore * weights.configuredQuality +
    calculateObservedSpeedScore(stats) * weights.observedSpeed +
    calculateLatencyScore(request, stats) * weights.latency +
    calculateFeatureBonus(request, provider) -
    calculateReliabilityPenalty(stats) * weights.reliabilityPenalty -
    calculateRateLimitPenalty(stats) * weights.rateLimitPenalty -
    calculateDailyQuotaPenalty(provider, stats) * weights.quotaPenalty -
    calculatePaidFallbackPenalty(request.mode, provider)
  );
}

/**
 * Returns scoring weights, preferring alias-specific weights over mode-based defaults.
 */
function getScoringWeights(mode: RoutingMode, aliasConfig?: AliasConfig): ScoringWeights {
  // Use alias-specific weights if provided
  if (aliasConfig?.weights !== undefined) {
    const speedWeight = aliasConfig.weights.speed ?? 2;
    const qualityWeight = aliasConfig.weights.quality ?? 1.5;

    return createWeights(speedWeight, qualityWeight, 2, 1, 1, 1, 1);
  }

  // Fall back to mode-based weights
  if (mode === "speed") {
    return createWeights(3, 1, 3, 1.5, 1, 1, 1);
  }

  if (mode === "quality") {
    return createWeights(1, 3, 1, 0.75, 1, 1, 0.75);
  }

  return mode === "survival" ? createWeights(1, 1, 1, 0.5, 3, 3, 2) : createWeights(2, 1.5, 2, 1, 1, 1, 1);
}

function createWeights(
  configuredSpeed: number,
  configuredQuality: number,
  observedSpeed: number,
  latency: number,
  reliabilityPenalty: number,
  rateLimitPenalty: number,
  quotaPenalty: number,
): ScoringWeights {
  return { configuredSpeed, configuredQuality, observedSpeed, latency, reliabilityPenalty, rateLimitPenalty, quotaPenalty };
}

function getConfiguredSpeedScore(provider: ProviderCandidate): number {
  return provider.speedScore ?? DEFAULT_SPEED_SCORE;
}

function calculateObservedSpeedScore(stats: ProviderStatsRecord | undefined): number {
  if (stats?.avgTokensPerSecond === undefined) {
    return MIN_SCORE;
  }

  return clampScore((stats.avgTokensPerSecond / TARGET_TOKENS_PER_SECOND) * MAX_SCORE);
}

function calculateLatencyScore(request: RouterRequest, stats: ProviderStatsRecord | undefined): number {
  if (stats === undefined) {
    return MIN_SCORE;
  }

  // For streaming requests, time-to-first-token is the meaningful latency signal;
  // for JSON requests, use end-to-end response time.
  const latencyMs = request.stream ? stats.avgTimeToFirstTokenMs : stats.avgLatencyMs;

  if (latencyMs === undefined) {
    return MIN_SCORE;
  }

  return clampScore(MAX_SCORE - (latencyMs / LATENCY_REFERENCE_MS) * MAX_SCORE);
}

function calculateReliabilityPenalty(stats: ProviderStatsRecord | undefined): number {
  if (stats === undefined) {
    return MIN_SCORE;
  }

  return ratio(stats.failureCount, stats.requestCount) * FAILURE_PENALTY_WEIGHT * calculateSampleConfidence(stats);
}

function calculateRateLimitPenalty(stats: ProviderStatsRecord | undefined): number {
  if (stats === undefined) {
    return MIN_SCORE;
  }

  return ratio(stats.rateLimitCount, stats.requestCount) * RATE_LIMIT_PENALTY_WEIGHT * calculateSampleConfidence(stats);
}

function calculateDailyQuotaPenalty(provider: ProviderCandidate, stats: ProviderStatsRecord | undefined): number {
  if (stats === undefined || provider.rateLimit.rpd === undefined) {
    return MIN_SCORE;
  }

  return clampScore(ratio(stats.requestCount, provider.rateLimit.rpd) * DAILY_QUOTA_PENALTY_WEIGHT);
}

function calculateFeatureBonus(request: RouterRequest, provider: ProviderCandidate): number {
  let bonus = 0;

  if (request.tools !== undefined && request.tools.length > 0 && provider.supportsTools) {
    bonus += FEATURE_TOOL_MATCH_BONUS;
  }

  if (request.responseFormat !== undefined && provider.supportsJson) {
    bonus += FEATURE_JSON_MATCH_BONUS;
  }

  return request.stream && provider.supportsStreaming ? bonus + FEATURE_STREAMING_MATCH_BONUS : bonus;
}

function calculateSampleConfidence(stats: ProviderStatsRecord): number {
  return Math.min(stats.requestCount / MIN_REQUESTS_FOR_FULL_CONFIDENCE, 1);
}

function calculatePaidFallbackPenalty(mode: RoutingMode, provider: ProviderCandidate): number {
  return mode === "survival" && provider.paidFallback ? MODE_SURVIVAL_PAID_PENALTY : 0;
}

/**
 * Applies tiebreaker to break equal scores. Uses the alias-configured tiebreak mode
 * or falls back to priority-based tiebreaking.
 */
function applyTiebreaker(
  score: number,
  provider: ProviderCandidate,
  tiebreakMode: TiebreakMode,
  stats?: ProviderStatsRecord,
): number {
  if (tiebreakMode === "speed") {
    // Use configured speed score as tiebreaker (higher is better)
    return score + (provider.speedScore ?? DEFAULT_SPEED_SCORE) / TIEBREAKER_DIVISOR;
  }

  if (tiebreakMode === "quality") {
    // Use quality score as tiebreaker (higher is better)
    return score + provider.qualityScore / TIEBREAKER_DIVISOR;
  }

  // Default: priority-based tiebreaker (higher priority wins)
  return score + provider.priority / TIEBREAKER_DIVISOR;
}

function clampScore(value: number): number {
  return Math.max(MIN_SCORE, Math.min(value, MAX_SCORE));
}

function ratio(count: number, total: number): number {
  return total <= 0 ? 0 : count / total;
}
