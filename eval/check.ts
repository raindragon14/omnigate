import { readdirSync, readFileSync } from "fs";
import { join } from "path";

import { loadProviderRegistry } from "../src/config/provider-loader";
import { computeScoreRatios, type ScoreRatio } from "./report";
import { selectBaseline } from "./harness";
import type { SuiteSummary } from "./types";

const RESULTS_DIR = "results";
const DEFAULT_MIN_RATIO = 1;

type SavedRun = {
  summary: SuiteSummary;
};

/** One failed quality gate. */
export type GateFailure = {
  suite: string;
  router: string;
  category: string;
  ratio: number | undefined;
  required: number;
};

/**
 * Checks every non-baseline router against the profile quality gate for its
 * category. Routers whose category has no profile (or no min_quality_ratio)
 * are skipped — gates activate only when the registry defines them.
 * @param summaries  All summaries for one suite.
 * @param profiles  Alias profiles keyed by alias name.
 * @param minRatioOverride  Optional floor applied to every gate.
 * @returns Failures; empty when all defined gates pass.
 */
export function evaluateGates(
  summaries: SuiteSummary[],
  profiles: Record<string, { categories: string[]; minQualityRatio?: number | undefined }>,
  minRatioOverride?: number | undefined,
): GateFailure[] {
  const baseline = selectBaseline(summaries);

  if (baseline === undefined) {
    return [];
  }

  const ratios = computeScoreRatios(summaries, baseline);
  const failures: GateFailure[] = [];

  for (const entry of ratios) {
    if (entry.router === baseline.router) {
      continue;
    }

    const required = resolveRequiredRatio(entry, profiles, minRatioOverride);

    if (required === undefined) {
      continue;
    }

    if (entry.ratio === undefined || entry.ratio < required) {
      failures.push({
        suite: baseline.suite,
        router: entry.router,
        category: entry.category,
        ratio: entry.ratio,
        required,
      });
    }
  }

  return failures;
}

function resolveRequiredRatio(
  entry: ScoreRatio,
  profiles: Record<string, { categories: string[]; minQualityRatio?: number | undefined }>,
  minRatioOverride: number | undefined,
): number | undefined {
  if (minRatioOverride !== undefined) {
    return minRatioOverride;
  }

  for (const profile of Object.values(profiles)) {
    if (profile.categories.includes(entry.category) && profile.minQualityRatio !== undefined) {
      return profile.minQualityRatio;
    }
  }

  return undefined;
}

/** Loads every saved run in eval/results, grouped by suite name. */
export function loadSavedRuns(dir: string): Map<string, SuiteSummary[]> {
  const runs = new Map<string, SuiteSummary[]>();

  let files: string[];

  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return runs;
  }

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(dir, file), "utf-8")) as Partial<SavedRun>;

    if (parsed.summary === undefined) {
      continue;
    }

    const existing = runs.get(parsed.summary.suite) ?? [];

    existing.push(parsed.summary);
    runs.set(parsed.summary.suite, existing);
  }

  return runs;
}

function main(): void {
  const args = process.argv.slice(2);
  const overrideIndex = args.indexOf("--min-ratio");
  let minRatioOverride: number | undefined;

  if (overrideIndex !== -1) {
    const raw = args[overrideIndex + 1];
    const parsed = raw === undefined ? Number.NaN : Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      console.error("--min-ratio must be a non-negative number");
      process.exit(1);
    }

    minRatioOverride = parsed;
  }

  const runs = loadSavedRuns(join(import.meta.dir, RESULTS_DIR));

  if (runs.size === 0) {
    console.log("eval:check - no saved results in eval/results/, nothing to gate");
    return;
  }

  const profiles = loadProviderRegistry().profiles;
  let failures = 0;

  for (const [suite, summaries] of runs) {
    const suiteFailures = evaluateGates(summaries, profiles, minRatioOverride);

    for (const failure of suiteFailures) {
      failures += 1;
      console.error(
        `FAIL ${suite} router=${failure.router} category=${failure.category} ` +
          `ratio=${failure.ratio === undefined ? "undefined" : failure.ratio.toFixed(3)} ` +
          `< required ${failure.required}`,
      );
    }

    if (suiteFailures.length === 0) {
      console.log(`ok ${suite} - all defined gates pass (${summaries.length} routers)`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
