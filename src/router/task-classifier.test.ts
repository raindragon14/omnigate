import { describe, expect, test } from "bun:test";

import { classifyTaskCategory } from "./task-classifier";
import type { RouterChatMessage } from "../shared/signatures";

function messages(...contents: string[]): RouterChatMessage[] {
  return contents.map((content) => ({ role: "user", content }));
}

describe("task classifier", () => {
  test("detects code fences as coding", () => {
    expect(classifyTaskCategory(messages("Fix this:\n```ts\nconst x = 1;\n```"))).toBe("coding");
  });

  test("detects stack traces as coding", () => {
    expect(classifyTaskCategory(messages("npm run build fails with error: Module not found"))).toBe(
      "coding",
    );
  });

  test("detects code file paths as coding", () => {
    expect(classifyTaskCategory(messages("Review src/router/fallback-runner.ts please"))).toBe(
      "coding",
    );
  });

  test("detects inline code plus keyword as coding", () => {
    expect(classifyTaskCategory(messages("Why does `bun test` fail on this import?"))).toBe(
      "coding",
    );
  });

  test("does not misclassify the word class in prose", () => {
    expect(classifyTaskCategory(messages("My class starts at 8am tomorrow"))).toBe("chat");
  });

  test("detects Indonesian writing requests", () => {
    expect(classifyTaskCategory(messages("Tuliskan karangan tentang liburan"))).toBe("writing");
  });

  test("detects English writing requests", () => {
    expect(classifyTaskCategory(messages("Write a blog post about remote work"))).toBe("writing");
  });

  test("detects factual questions as knowledge", () => {
    expect(classifyTaskCategory(messages("What is the capital of France?"))).toBe("knowledge");
  });

  test("detects Indonesian questions as knowledge", () => {
    expect(classifyTaskCategory(messages("Siapa presiden pertama Indonesia"))).toBe("knowledge");
  });

  test("defaults small talk to chat", () => {
    expect(classifyTaskCategory(messages("Halo, apa kabar hari ini"))).toBe("chat");
  });

  test("defaults empty messages to chat", () => {
    expect(classifyTaskCategory(messages("hi"))).toBe("chat");
  });

  test("coding wins over writing when both match", () => {
    expect(
      classifyTaskCategory(messages("Tulis artikel dan sertakan contoh:\n```py\nprint(1)\n```")),
    ).toBe("coding");
  });
});
