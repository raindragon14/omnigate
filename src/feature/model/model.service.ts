import type { ModelListResponse, RouterModel } from "../../shared/signatures";

const MODEL_OBJECT_TYPE = "model";
const MODEL_LIST_OBJECT_TYPE = "list";
const MODEL_OWNER = "omnigate";

const ROUTER_MODELS: RouterModel[] = [
  createRouterModel("omnigate/deepseek-v4-flash-auto"),
  createRouterModel("omnigate/mimo-v2.5-auto"),
  createRouterModel("omnigate/coding-balanced"),
  createRouterModel("omnigate/coding-fast"),
];

/**
 * Returns the hardcoded list of model aliases exposed by the router.
 * @returns A ModelListResponse containing all router model aliases.
 */
export function listRouterModels(): ModelListResponse {
  return {
    object: MODEL_LIST_OBJECT_TYPE,
    data: ROUTER_MODELS,
  };
}

function createRouterModel(id: string): RouterModel {
  return {
    id,
    object: MODEL_OBJECT_TYPE,
    owned_by: MODEL_OWNER,
  };
}
