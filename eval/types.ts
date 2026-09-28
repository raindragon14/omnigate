/** Shared types for the offline routing-evaluation harness. */

/** Validation/test split marker. Baselines are selected on validation only. */
export type EvalSplit = "validation" | "test";

/** One evaluation item. Suites are plain JSON in this shape. */
export type EvalItem = {
  id: string;
  category: string;
  split: EvalSplit;
  question: string;
  answers: string[];
};

/** A parsed evaluation suite. */
export type EvalSuite = {
  name: string;
  category: string;
  description: string;
  items: EvalItem[];
};

/** One router attempt at one item. */
export type RouterAttempt = {
  answer: string;
  latencyMs?: number | undefined;
  costUsd?: number | undefined;
};

/** A router under evaluation: fixed, random, oracle, or live gateway. */
export type RouterFn = (item: EvalItem) => Promise<RouterAttempt> | RouterAttempt;

/** Per-item verdict. `not_attempted` is an abstention, not a failure. */
export type JudgeVerdict = "correct" | "incorrect" | "not_attempted" | "error";

/** A judge maps an item plus a router answer to a verdict. */
export type JudgeFn = (item: EvalItem, answer: string) => JudgeVerdict;

/** Judged outcome for one item. */
export type EvalResult = {
  id: string;
  category: string;
  split: EvalSplit;
  answer: string;
  verdict: JudgeVerdict;
  latencyMs?: number | undefined;
  costUsd?: number | undefined;
};

/** Counters shared by full and per-split summaries. */
export type EvalCounters = {
  total: number;
  correct: number;
  incorrect: number;
  notAttempted: number;
  errors: number;
  accuracyTotal: number;
  accuracyAttempted: number;
};

/** Aggregate outcome of one suite run. */
export type SuiteSummary = EvalCounters & {
  suite: string;
  router: string;
  category: string;
  avgLatencyMs?: number | undefined;
  totalCostUsd?: number | undefined;
  bySplit: Record<EvalSplit, EvalCounters>;
};
