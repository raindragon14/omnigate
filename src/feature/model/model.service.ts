import type { ModelListResponse, RouterModel } from "../../../docs/codebase-signatures";

const MODEL_OBJECT_TYPE = "model";
const MODEL_LIST_OBJECT_TYPE = "list";
const MODEL_OWNER = "free-router";

const ROUTER_MODELS: RouterModel[] = [
  createRouterModel("free-router/deepseek-v4-flash-auto"),
  createRouterModel("free-router/mimo-v2.5-auto"),
  createRouterModel("free-router/coding-balanced"),
  createRouterModel("free-router/coding-fast"),
  createRouterModel("free-router/emergency-paid"),
];

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
