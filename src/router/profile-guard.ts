import { RoutingError } from "../feature/chat-completion/chat-completion.service";
import { classifyTaskCategory } from "./task-classifier";
import type { AliasProfile, RouterChatMessage, TaskCategory } from "../shared/signatures";

const SCOPE_MISMATCH_CODE = "profile_scope_mismatch";
const QUALITY_BAR_CODE = "no_provider_meets_quality";
const FALLBACK_PROFILE_ID = "omnigate/auto";

export const STRICT_QUALITY_PROFILES = new Set<string>(["omnigate/code-quality"]);

export function classifyProfileCategory(messages: RouterChatMessage[]): TaskCategory {
  return classifyTaskCategory(messages);
}

export function enforceProfileScope(
  model: string,
  category: TaskCategory,
  profiles: Record<string, AliasProfile>,
): void {
  const profile = profiles[model];

  if (profile === undefined || profile.categories.includes(category)) {
    return;
  }

  throw new RoutingError(
    SCOPE_MISMATCH_CODE,
    `model ${model} only serves [${profile.categories.join(", ")}]; detected [${category}]; use ${FALLBACK_PROFILE_ID}`,
  );
}

export function checkQualityBar(
  topQualityScore: number | undefined,
  maxQualityScore: number | undefined,
  minQualityRatio: number | undefined,
): boolean {
  if (
    topQualityScore === undefined ||
    maxQualityScore === undefined ||
    maxQualityScore <= 0 ||
    minQualityRatio === undefined
  ) {
    return true;
  }

  return topQualityScore / maxQualityScore >= minQualityRatio;
}

export function qualityMissCode(): "no_provider_meets_quality" {
  return QUALITY_BAR_CODE;
}
