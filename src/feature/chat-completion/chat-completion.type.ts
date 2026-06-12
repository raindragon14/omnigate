import type { ChatCompletionErrorResponse, OpenAIChatCompletionResponse } from "../../shared/signatures";

/** A chat completion response that is either a successful OpenAI response or an error shape. */
export type ChatCompletionResponse = OpenAIChatCompletionResponse | ChatCompletionErrorResponse;

/** Route path for the chat completion endpoint. */
export const ROUTE_PATH = "/v1/chat/completions";
