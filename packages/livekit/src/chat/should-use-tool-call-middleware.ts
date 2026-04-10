import type { RequestData } from "../types";

function isOfficialOpenAIBaseURL(baseURL?: string): boolean {
  return baseURL?.includes("openai.com") ?? false;
}

export function shouldUseToolCallMiddleware(llm: RequestData["llm"]): boolean {
  if (llm.useToolCallMiddleware !== undefined) {
    return llm.useToolCallMiddleware;
  }

  // Many OpenAI-compatible servers still have fragile native tool-call
  // handling. When the user points Pochi at a custom baseURL and hasn't
  // explicitly opted in/out, prefer the middleware-based ReAct transport.
  if (
    llm.type === "openai" &&
    llm.baseURL &&
    !isOfficialOpenAIBaseURL(llm.baseURL)
  ) {
    return true;
  }

  return false;
}
