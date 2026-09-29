import type { RouterChatMessage, TaskCategory } from "../shared/signatures";

const CODE_FENCE_MARKER = "```";
const CODE_FILE_PATTERN =
  /[\w\-./]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp|h|cs|swift|kt|sql|sh|yaml|yml|json|toml|tf|dockerfile)\b/i;
const INLINE_CODE_PATTERN = /`[^`]+`/;
const STRONG_CODING_SIGNALS =
  /\b(function|def |import |export |traceback|stacktrace|compile|npm|bun|yarn|pnpm|pip|docker|kubectl|git (diff|log|status|push|pull|commit|merge|rebase)|select .* from|ci\/cd|pull request|test coverage|refactor|lint|middleware)\b/i;
const WEAK_CODING_SIGNALS =
  /\b(class|const |let |var |return|async|await|error|exception|runtime|deploy|endpoint)\b/i;
const LANGUAGE_NAMES =
  /\b(typescript|javascript|python|golang|go\b|rust|java\b|ruby|php\b|swift|kotlin|sql|bash|yaml|regex|docker|kubernetes)\b/i;
const WRITING_KEYWORDS =
  /\b(tulis|tuliskan|karangan|esai|artikel|cerita|caption|surat lamaran|email|naskah|draf|draft|parafrase|paraphrase|ringkas|summar(y|ize|ise)|résumé|resume|cv\b|cover letter|blog post|script|pidato|puisi|novel|press release|menulis)\b/i;
const KNOWLEDGE_PREFIX =
  /^\s*(what|who|where|when|why|how|which|apa|siapa|di mana|dimana|kapan|mengapa|kenapa|bagaimana|berapa|jelaskan)\b/i;

export function classifyTaskCategory(messages: RouterChatMessage[]): TaskCategory {
  const text = collectText(messages);

  if (
    text.includes(CODE_FENCE_MARKER) ||
    CODE_FILE_PATTERN.test(text) ||
    STRONG_CODING_SIGNALS.test(text) ||
    ((WEAK_CODING_SIGNALS.test(text) || LANGUAGE_NAMES.test(text)) && mentionsCode(text))
  ) {
    return "coding";
  }

  if (WRITING_KEYWORDS.test(text)) {
    return "writing";
  }

  if (text.includes("?") || KNOWLEDGE_PREFIX.test(text)) {
    return "knowledge";
  }

  return "chat";
}

function collectText(messages: RouterChatMessage[]): string {
  return messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
}

function mentionsCode(text: string): boolean {
  return (
    INLINE_CODE_PATTERN.test(text) ||
    CODE_FILE_PATTERN.test(text) ||
    text.includes(CODE_FENCE_MARKER)
  );
}
