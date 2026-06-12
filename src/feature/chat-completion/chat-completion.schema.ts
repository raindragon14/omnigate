import { z } from "zod";

/** Zod schema for a single chat message, enforcing valid roles and content rules. */
export const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.unknown()).optional(),
}).refine(
  (msg) => {
    if (msg.content !== null) {
      return true;
    }

    return msg.role === "assistant" || msg.role === "tool";
  },
  { message: "content can only be null for assistant or tool messages" },
);

/** Zod schema for the POST /v1/chat/completions request body (OpenAI-compatible). */
export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(messageSchema).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional(),
});
