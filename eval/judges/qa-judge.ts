import type { EvalItem, JudgeVerdict } from "../types";

const ABSTAIN_PATTERNS = [
  /i don'?t know/i,
  /not sure/i,
  /cannot answer/i,
  /no idea/i,
  /tidak tahu/i,
  /kurang yakin/i,
  /tidak bisa menjawab/i,
  /tidak yakin/i,
];

const LEADING_ARTICLES = /^(a|an|the)\s+/;

/**
 * Normalizes an answer for comparison: lowercase, no punctuation,
 * no leading article, collapsed whitespace.
 */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_ARTICLES, "");
}

/**
 * Judges one Q&A answer: correct on normalized exact match against any
 * accepted answer, not_attempted on abstention or empty answer.
 */
export function judgeQa(item: EvalItem, answer: string): JudgeVerdict {
  if (answer.trim() === "") {
    return "not_attempted";
  }

  if (ABSTAIN_PATTERNS.some((pattern) => pattern.test(answer))) {
    return "not_attempted";
  }

  const normalized = normalizeAnswer(answer);

  return item.answers.some((accepted) => normalizeAnswer(accepted) === normalized)
    ? "correct"
    : "incorrect";
}
