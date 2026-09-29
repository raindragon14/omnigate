import { describe, expect, test } from "bun:test";

import type { SuiteSummary } from "./types";
import { evaluateGates } from "./check";
import { summarizeResults } from "./harness";
import type { EvalResult } from "./types";

function resultWith(id: string, verdict: EvalResult["verdict"]): EvalResult {
  return { id, category: "coding", split: "validation", answer: "", verdict };
}

function summaryFor(router: string, verdicts: EvalResult["verdict"][]): SuiteSummary {
  return summarizeResults(
    "gate-demo",
    router,
    "coding",
    verdicts.map((verdict, index) => resultWith(`item-${index}`, verdict)),
  );
}

const NO_PROFILES: Record<string, { categories: string[]; minQualityRatio?: number | undefined }> =
  {};

/** Unit tests for offline profile quality gates. */
describe("eval gates", () => {
  /** Should pass when the registry defines no quality gates. */
  test("skips when no gate is defined", () => {
    const baseline = summaryFor("oracle", ["correct", "correct"]);
    const challenger = summaryFor("omnigate", ["incorrect", "incorrect"]);

    expect(evaluateGates([baseline, challenger], NO_PROFILES)).toEqual([]);
  });

  /** Should fail a challenger below the profile's min quality ratio. */
  test("fails challenger below the required ratio", () => {
    const baseline = summaryFor("oracle", ["correct", "correct"]);
    const challenger = summaryFor("omnigate", ["correct", "incorrect"]);
    const profiles = { "omnigate/code-quality": { categories: ["coding"], minQualityRatio: 0.9 } };

    const failures = evaluateGates([baseline, challenger], profiles);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.router).toBe("omnigate");
    expect(failures[0]?.ratio).toBeCloseTo(0.5, 9);
    expect(failures[0]?.required).toBe(0.9);
  });

  /** Should pass a challenger meeting the required ratio. */
  test("passes challenger at the required ratio", () => {
    const baseline = summaryFor("oracle", ["correct", "correct"]);
    const challenger = summaryFor("omnigate", ["correct", "correct"]);
    const profiles = { "omnigate/code-quality": { categories: ["coding"], minQualityRatio: 0.9 } };

    expect(evaluateGates([baseline, challenger], profiles)).toEqual([]);
  });

  /** Should ignore categories no profile covers. */
  test("skips categories without a profile", () => {
    const baseline = summaryFor("oracle", ["correct", "correct"]);
    const challenger = summaryFor("omnigate", ["incorrect", "incorrect"]);
    const profiles = { "omnigate/code-quality": { categories: ["writing"], minQualityRatio: 0.9 } };

    expect(evaluateGates([baseline, challenger], profiles)).toEqual([]);
  });

  /** Should let a CLI override beat profile-defined ratios. */
  test("applies an explicit ratio override", () => {
    const baseline = summaryFor("oracle", ["correct", "correct"]);
    const challenger = summaryFor("omnigate", ["correct", "incorrect"]);

    const failures = evaluateGates([baseline, challenger], NO_PROFILES, 0.6);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.required).toBe(0.6);
  });

  /** Should handle an empty summary list gracefully. */
  test("returns no failures for no summaries", () => {
    expect(evaluateGates([], NO_PROFILES)).toEqual([]);
  });
});
