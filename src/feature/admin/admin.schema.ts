import { z } from "zod";

const DAY_PATTERN_MESSAGE = "day must be YYYY-MM-DD";

/** UTC day pattern shared by admin query and body schemas. */
export const STATS_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Zod schema for the GET /v1/stats query string. */
export const statsQuerySchema = z.object({
  day: z.string().regex(STATS_DAY_PATTERN, DAY_PATTERN_MESSAGE).optional(),
});

/** Zod schema for POST /v1/admin/cooldowns/clear (all fields optional). */
export const clearCooldownsSchema = z.object({
  provider_id: z.string().min(1).optional(),
});

/** Zod schema for POST /v1/admin/stats/reset. */
export const resetStatsSchema = z.object({
  day: z.string().regex(STATS_DAY_PATTERN, DAY_PATTERN_MESSAGE).optional(),
});
