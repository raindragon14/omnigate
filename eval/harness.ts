import type {
  EvalCounters,
  EvalItem,
  EvalResult,
  EvalSplit,
  JudgeFn,
  RouterFn,
  SuiteSummary,
} from "./types";

function emptyCounters(): EvalCounters {
  return {
    total: 0,
    correct: 0,
    incorrect: 0,
    notAttempted: 0,
    errors: 0,
    accuracyTotal: 0,
    accuracyAttempted: 0,
  };
}

function finalizeCounters(counters: EvalCounters): EvalCounters {
  const attempted = counters.correct + counters.incorrect;

  return {
    ...counters,
    accuracyTotal: counters.total === 0 ? 0 : counters.correct / counters.total,
    accuracyAttempted: attempted === 0 ? 0 : counters.correct / attempted,
  };
}

/**
 * Runs every suite item through one router and judges each attempt.
 * Per-item failures are recorded as errors; the run never stops early.
 */
export async function runSuite(
  suiteName: string,
  items: EvalItem[],
  routerName: string,
  router: RouterFn,
  judge: JudgeFn,
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const item of items) {
    try {
      const attempt = await router(item);

      results.push({
        id: item.id,
        category: item.category,
        split: item.split,
        answer: attempt.answer,
        verdict: judge(item, attempt.answer),
        latencyMs: attempt.latencyMs,
        costUsd: attempt.costUsd,
      });
    } catch {
      results.push({
        id: item.id,
        category: item.category,
        split: item.split,
        answer: "",
        verdict: "error",
      });
    }
  }

  return results;
}

/**
 * Aggregates judged results into overall plus per-split summaries.
 * Unknown costs stay unknown: totalCostUsd is undefined when no attempt
 * reported a cost (never zero-filled).
 */
export function summarizeResults(
  suiteName: string,
  routerName: string,
  category: string,
  results: EvalResult[],
): SuiteSummary {
  const overall = emptyCounters();
  const bySplit: Record<EvalSplit, EvalCounters> = {
    validation: emptyCounters(),
    test: emptyCounters(),
  };
  const latencies: number[] = [];
  let totalCostUsd: number | undefined;

  for (const result of results) {
    overall.total += 1;
    bySplit[result.split].total += 1;
    bumpCounter(overall, result);
    bumpCounter(bySplit[result.split], result);

    if (result.latencyMs !== undefined) {
      latencies.push(result.latencyMs);
    }

    if (result.costUsd !== undefined) {
      totalCostUsd = (totalCostUsd ?? 0) + result.costUsd;
    }
  }

  return {
    ...finalizeCounters(overall),
    suite: suiteName,
    router: routerName,
    category,
    avgLatencyMs: latencies.length === 0 ? undefined : average(latencies),
    totalCostUsd,
    bySplit: {
      validation: finalizeCounters(bySplit.validation),
      test: finalizeCounters(bySplit.test),
    },
  };
}

function bumpCounter(counters: EvalCounters, result: EvalResult): void {
  switch (result.verdict) {
    case "correct":
      counters.correct += 1;
      break;
    case "incorrect":
      counters.incorrect += 1;
      break;
    case "not_attempted":
      counters.notAttempted += 1;
      break;
    case "error":
      counters.errors += 1;
      break;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Selects the baseline router: highest validation accuracy.
 * Baselines are always selected on validation, never on test.
 */
export function selectBaseline(summaries: SuiteSummary[]): SuiteSummary | undefined {
  let best: SuiteSummary | undefined;

  for (const summary of summaries) {
    if (
      best === undefined ||
      summary.bySplit.validation.accuracyTotal > best.bySplit.validation.accuracyTotal
    ) {
      best = summary;
    }
  }

  return best;
}

/**
 * Checks whether a router ranking on a subset matches the full-suite
 * ranking exactly. Used to validate that a dev subset preserves order.
 */
export function rankingOrderMatches(fullOrder: string[], subsetOrder: string[]): boolean {
  return (
    fullOrder.length === subsetOrder.length &&
    fullOrder.every((name, index) => name === subsetOrder[index])
  );
}
