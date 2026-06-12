import type { HealthResponse } from "../../shared/signatures";

const SERVICE_NAME = "omnigate";
const STATUS_OK = "ok";

/**
 * Returns the current health status of the OmniGate service.
 * @returns A HealthResponse with status "ok" and service name "omnigate".
 */
export function getHealthStatus(): HealthResponse {
  return {
    status: STATUS_OK,
    service: SERVICE_NAME,
  };
}
