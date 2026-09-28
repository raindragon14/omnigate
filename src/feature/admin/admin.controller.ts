import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { StatsSnapshotResponse } from "../../shared/signatures";
import { HTTP_STATUS_BAD_REQUEST } from "../../shared/http-status";
import { formatStatsDay } from "../../storage/provider-stats.repository";
import {
  clearRoutingCooldowns,
  resetRoutingStats,
} from "../chat-completion/chat-completion.service";
import { clearCooldownsSchema, resetStatsSchema, statsQuerySchema } from "./admin.schema";
import { getStatsSnapshot } from "./admin.service";

const INVALID_REQUEST_CODE = "invalid_request";

/**
 * Handles GET /v1/stats requests. Active cooldowns are visible as future
 * `cooldown_until` values on today's rows.
 * @param context  Hono request context.
 * @returns A JSON Response with the UTC day and its provider rows.
 */
export function getStatsController(context: Context): Response {
  const query = statsQuerySchema.safeParse({ day: context.req.query("day") });

  if (!query.success) {
    return sendBadRequestError(context, query.error.message);
  }

  return context.json(getStatsSnapshot(query.data.day) satisfies StatsSnapshotResponse);
}

/**
 * Handles POST /v1/admin/cooldowns/clear requests. Clears in-memory and
 * persisted cooldowns for one provider, or all providers when no
 * `provider_id` is given.
 * @param context  Hono request context.
 * @returns A JSON Response with the number of entries cleared.
 */
export async function handleClearCooldowns(context: Context): Promise<Response> {
  const parseResult = clearCooldownsSchema.safeParse(await parseAdminBody(context));

  if (!parseResult.success) {
    return sendBadRequestError(context, parseResult.error.message);
  }

  return context.json({
    status: "ok",
    cleared: clearRoutingCooldowns(parseResult.data.provider_id),
  });
}

/**
 * Handles POST /v1/admin/stats/reset requests. Deletes stats rows for one
 * UTC day (today when omitted).
 * @param context  Hono request context.
 * @returns A JSON Response with the day and the number of rows deleted.
 */
export async function handleResetStats(context: Context): Promise<Response> {
  const parseResult = resetStatsSchema.safeParse(await parseAdminBody(context));

  if (!parseResult.success) {
    return sendBadRequestError(context, parseResult.error.message);
  }

  const day = parseResult.data.day ?? formatStatsDay(Date.now());
  const deleted = resetRoutingStats(day);

  return context.json({
    status: "ok",
    day,
    deleted,
  });
}

async function parseAdminBody(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return {};
  }
}

function sendBadRequestError(context: Context, message: string): Response {
  return context.json(
    {
      error: {
        message,
        type: INVALID_REQUEST_CODE,
        code: INVALID_REQUEST_CODE,
      },
    },
    HTTP_STATUS_BAD_REQUEST as ContentfulStatusCode,
  );
}
