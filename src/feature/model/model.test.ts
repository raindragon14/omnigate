import { describe, expect, test } from "bun:test";

import { listRouterModels } from "./model.service";

const EXPECTED_MODEL_LIST_OBJECT = "list";
const EXPECTED_MODEL_IDS = [
  "omnigate/deepseek-v4-flash-auto",
  "omnigate/mimo-v2.5-auto",
  "omnigate/coding-balanced",
  "omnigate/coding-fast",
  "omnigate/emergency-paid",
];

/** Unit tests for the model feature. */
describe("model feature", () => {
  /** Should return the list of router model aliases with correct structure. */
  test("lists router model aliases", () => {
    const modelList = listRouterModels();

    expect(modelList.object).toBe(EXPECTED_MODEL_LIST_OBJECT);
    expect(modelList.data.map((model) => model.id)).toEqual(EXPECTED_MODEL_IDS);
  });
});
