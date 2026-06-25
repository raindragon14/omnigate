import { loadProviderRegistry } from "../../config/provider-loader";
import type { ModelListResponse, RouterModel } from "../../shared/signatures";

const MODEL_OBJECT_TYPE = "model";
const MODEL_LIST_OBJECT_TYPE = "list";
const MODEL_OWNER = "omnigate";

/**
 * Returns the list of model aliases exposed by the router.
 * Aliases are loaded dynamically from provider.registry.yaml so the API
 * surface always matches the configured registry.
 * @returns A ModelListResponse containing all router model aliases.
 */
export function listRouterModels(): ModelListResponse {
  const registry = loadProviderRegistry();
  const aliases = Object.keys(registry.aliases);

  return {
    object: MODEL_LIST_OBJECT_TYPE,
    data: aliases.map(createRouterModel),
  };
}

function createRouterModel(id: string): RouterModel {
  return {
    id,
    object: MODEL_OBJECT_TYPE,
    owned_by: MODEL_OWNER,
  };
}
