import { DefaultCodexInstructions } from "./constants";

export function transformToCodexFormat(request: Record<string, unknown>) {
  const model = (request.model as string) || "gpt-5";
  const instructions = DefaultCodexInstructions;
  const input =
    (request.input as Array<{ role: string; content: unknown }>) || [];
  const transformedInput = input.map((msg) => ({
    ...msg,
    role: msg.role === "developer" ? "user" : msg.role,
  }));

  return {
    model,
    instructions,
    input: transformedInput,
    store: false,
    stream: true,
    include: ["reasoning.encrypted_content"],
    tools: [],
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
}
