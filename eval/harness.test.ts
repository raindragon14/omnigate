import { describe, expect, test } from "bun:test";

import type { EvalItem, EvalResult, RouterFn } from "./types";
import { rankingOrderMatches, runSuite, selectBaseline, summarizeResults } from "./harness";
import { computeScoreRatios } from "./report";
import {
  createFixedRouter,
  createOracleRouter,
  createRandomRouter,
  createSeededRandom,
} from "./routers";
import { judgeQa } from "./judges/qa-judge";

const ITEMS: EvalItem[] = [
  { id: "a", category: "knowledge", split: "validation", question: "Q1", answers: ["Paris"] },
  { id: "b", category: "knowledge", split: "validation", question: "Q2", answers: ["Tokyo"] },
  { id: "c", category: "knowledge", split: "test", question: "Q3", answers: ["Mars"] },
];

function resultWith(id: string, verdict: EvalResult["verdict"]): EvalResult {
  return { id, category: "knowledge", split: "validation", answer: "", verdict };
}

/** Unit tests for the evaluation harness. */
describe("harness", () => {
  describe("runSuite", () => {
    /** Should score every item through the router and judge. */
    test("scores oracle runs as all correct", async () => {
      const results = await runSuite("demo", ITEMS, "oracle", createOracleRouter(), judgeQa);

      expect(results).toHaveLength(3);
      expect(results.every((result) => result.verdict === "correct")).toBe(true);
    });

    /** Should record router failures as errors without stopping. */
    test("records router errors", async () => {
      const failing: RouterFn = (item) => {
        if (item.id === "a") {
          throw new Error("boom");
        }

        return { answer: "Paris" };
      };
      const results = await runSuite("demo", ITEMS, "flaky", failing, judgeQa);

      expect(results.map((result) => result.verdict)).toEqual(["error", "incorrect", "incorrect"]);
    });
  });

  describe("summarizeResults", () => {
    /** Should aggregate counts, accuracies, and per-split summaries. */
    test("aggregates counters", () => {
      const summary = summarizeResults("demo", "fixed", "knowledge", [
        resultWith("a", "correct"),
        resultWith("b", "incorrect"),
        { ...resultWith("c", "correct"), split: "test" },
      ]);

      expect(summary.total).toBe(3);
      expect(summary.correct).toBe(2);
      expect(summary.accuracyTotal).toBeCloseTo(2 / 3, 9);
      expect(summary.accuracyAttempted).toBeCloseTo(2 / 3, 9);
      expect(summary.bySplit.validation.total).toBe(2);
      expect(summary.bySplit.test.correct).toBe(1);
      expect(summary.avgLatencyMs).toBeUndefined();
      expect(summary.totalCostUsd).toBeUndefined();
    });

    /** Should average latencies and sum known costs only. */
    test("aggregates latency and cost", () => {
      const summary = summarizeResults("demo", "live", "knowledge", [
        { ...resultWith("a", "correct"), latencyMs: 100, costUsd: 0.001 },
        { ...resultWith("b", "correct"), latencyMs: 300 },
      ]);

      expect(summary.avgLatencyMs).toBe(200);
      expect(summary.totalCostUsd).toBeCloseTo(0.001, 9);
    });
  });

  describe("selectBaseline", () => {
    /** Should pick the highest validation accuracy, never test. */
    test("selects on validation only", () => {
      const weak = summarizeResults("demo", "weak", "knowledge", [
        { ...resultWith("a", "correct"), split: "validation" },
        { ...resultWith("b", "incorrect"), split: "validation" },
        { ...resultWith("c", "correct"), split: "test" },
      ]);
      const strong = summarizeResults("demo", "strong", "knowledge", [
        { ...resultWith("a", "correct"), split: "validation" },
        { ...resultWith("b", "correct"), split: "validation" },
        { ...resultWith("c", "incorrect"), split: "test" },
      ]);

      expect(selectBaseline([weak, strong])?.router).toBe("strong");
      expect(selectBaseline([])).toBeUndefined();
    });
  });

  describe("rankingOrderMatches", () => {
    /** Should compare ranking orders exactly. */
    test("matches identical orders", () => {
      expect(rankingOrderMatches(["a", "b"], ["a", "b"])).toBe(true);
      expect(rankingOrderMatches(["a", "b"], ["b", "a"])).toBe(false);
      expect(rankingOrderMatches(["a"], ["a", "b"])).toBe(false);
    });
  });

  describe("computeScoreRatios", () => {
    /** Should ratio router accuracy against the baseline. */
    test("computes ratios", () => {
      const baseline = summarizeResults("demo", "base", "knowledge", [
        resultWith("a", "correct"),
        resultWith("b", "incorrect"),
      ]);
      const challenger = summarizeResults("demo", "challenger", "knowledge", [
        resultWith("a", "correct"),
        resultWith("b", "correct"),
      ]);

      const ratios = computeScoreRatios([baseline, challenger], baseline);

      expect(ratios).toHaveLength(2);
      expect(ratios[0]?.ratio).toBe(1);
      expect(ratios[1]?.ratio).toBe(2);
    });

    /** Should leave the ratio undefined for a zero baseline. */
    test("handles zero baseline", () => {
      const baseline = summarizeResults("demo", "base", "knowledge", [
        resultWith("a", "incorrect"),
      ]);
      const challenger = summarizeResults("demo", "challenger", "knowledge", [
        resultWith("a", "correct"),
      ]);

      expect(computeScoreRatios([challenger], baseline)[0]?.ratio).toBeUndefined();
    });
  });

  describe("random router", () => {
    /** Should be deterministic for a given seed. */
    test("reproduces picks per seed", async () => {
      const pool = ["Paris", "Tokyo", "Mars"];
      const first = await runSuite("demo", ITEMS, "r1", createRandomRouter(pool, 7), judgeQa);
      const second = await runSuite("demo", ITEMS, "r2", createRandomRouter(pool, 7), judgeQa);

      expect(first.map((result) => result.answer)).toEqual(second.map((result) => result.answer));
      expect(createSeededRandom(7)()).not.toBe(createSeededRandom(8)());
    });
  });

  describe("fixed router", () => {
    /** Should surface abstentions through the judge. */
    test("counts abstentions separately", async () => {
      const results = await runSuite(
        "demo",
        ITEMS,
        "fixed",
        createFixedRouter("I don't know"),
        judgeQa,
      );
      const summary = summarizeResults("demo", "fixed", "knowledge", results);

      expect(summary.notAttempted).toBe(3);
      expect(summary.accuracyTotal).toBe(0);
    });
  });
});
