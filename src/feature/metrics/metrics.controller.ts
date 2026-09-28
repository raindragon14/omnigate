import type { Context } from "hono";

import { getPrometheusMetrics } from "./metrics.service";

const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

/**
 * Handles GET /metrics requests.
 * @param context  Hono request context.
 * @returns A text Response with Prometheus exposition format metrics.
 */
export function getMetricsController(context: Context): Response {
  return new Response(getPrometheusMetrics(), {
    headers: { "Content-Type": METRICS_CONTENT_TYPE },
  });
}
