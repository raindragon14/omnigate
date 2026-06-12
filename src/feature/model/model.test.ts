import { describe, expect, test } from "bun:test";

import { listRouterModels } from "./model.service";

const EXPECTED_MODEL_LIST_OBJECT = "list";
const EXPECTED_MODEL_IDS = [
  "free-router/deepseek-v4-flash-auto",
  "free-router/mimo-v2.5-auto",
  "free-router/coding-balanced",
  "free-router/coding-fast",
  "free-router/emergency-paid",
];

describe("model feature", () => {
  test("lists router model aliases", () => {
    const modelList = listRouterModels();

    expect(modelList.object).toBe(EXPECTED_MODEL_LIST_OBJECT);
    expect(modelList.data.map((model) => model.id)).toEqual(EXPECTED_MODEL_IDS);
  });
});
