import type { OpenAIChatCompletionResponse } from "../../shared/signatures";

export type ChatCompletionErrorResponse = {
  error: {
    message: string;
    type: string;
    code: string;
  };
};

export type ChatCompletionResponse = OpenAIChatCompletionResponse | ChatCompletionErrorResponse;

export const ROUTE_PATH = "/v1/chat/completions";
