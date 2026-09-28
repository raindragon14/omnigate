import type { SuiteSummary } from "./types";

/** Router score relative to a baseline: ratio of total accuracies. */
export type ScoreRatio = {
  router: string;
  category: string;
  routerAccuracy: number;
  baselineAccuracy: number;
  /** Undefined when the baseline accuracy is zero (no meaningful ratio). */
  ratio: number | undefined;
};

/**
 * Computes per-router score ratios against one baseline summary.
 * This is the number compared against profile quality gates.
 */
export function computeScoreRatios(
  summaries: SuiteSummary[],
  baseline: SuiteSummary,
): ScoreRatio[] {
  return summaries.map((summary) => ({
    router: summary.router,
    category: summary.category,
    routerAccuracy: summary.accuracyTotal,
    baselineAccuracy: baseline.accuracyTotal,
    ratio:
      baseline.accuracyTotal === 0 ? undefined : summary.accuracyTotal / baseline.accuracyTotal,
  }));
}
