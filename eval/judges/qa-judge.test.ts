import { describe, expect, test } from "bun:test";

import type { EvalItem } from "../types";
import { judgeQa, normalizeAnswer } from "./qa-judge";

const ITEM: EvalItem = {
  id: "qa-01",
  category: "knowledge",
  split: "validation",
  question: "What is the capital of France?",
  answers: ["Paris"],
};

/** Unit tests for the Q&A judge. */
describe("qa judge", () => {
  /** Should accept case, punctuation, and article variants. */
  test("accepts answer variants", () => {
    expect(judgeQa(ITEM, "Paris")).toBe("correct");
    expect(judgeQa(ITEM, "paris!")).toBe("correct");
    expect(judgeQa(ITEM, "The Paris")).toBe("correct");
    expect(judgeQa(ITEM, "  PARIS  ")).toBe("correct");
  });

  /** Should reject wrong answers. */
  test("rejects wrong answers", () => {
    expect(judgeQa(ITEM, "London")).toBe("incorrect");
    expect(judgeQa(ITEM, "Parisian")).toBe("incorrect");
  });

  /** Should treat abstentions as not attempted, in English and Indonesian. */
  test("detects abstentions", () => {
    expect(judgeQa(ITEM, "I don't know")).toBe("not_attempted");
    expect(judgeQa(ITEM, "I'm not sure")).toBe("not_attempted");
    expect(judgeQa(ITEM, "Tidak tahu")).toBe("not_attempted");
    expect(judgeQa(ITEM, "")).toBe("not_attempted");
    expect(judgeQa(ITEM, "   ")).toBe("not_attempted");
  });

  /** Should normalize answers deterministically. */
  test("normalizes answers", () => {
    expect(normalizeAnswer("  The Eiffel Tower!! ")).toBe("eiffel tower");
  });
});
