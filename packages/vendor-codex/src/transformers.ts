import * as fs from "node:fs";
import * as path from "node:path";
import { SHELL_TOOL, UPDATE_PLAN_TOOL } from "./tools";

function loadCodexInstructions(): string {
  try {
    const instructionsPath = path.join(__dirname, "codex-instructions.txt");
    return fs.readFileSync(instructionsPath, "utf-8");
  } catch {
    return "You are a helpful assistant.";
  }
}

export function transformToCodexFormat(request: Record<string, unknown>) {
  const instructions = loadCodexInstructions();

  const userMessages = (
    (request.messages as Array<{ role: string; content: unknown }>) || []
  )
    .filter((msg) => msg.role === "user")
    .map((msg) => ({
      type: "message",
      role: msg.role,
      content: [
        {
          type: "input_text",
          text: extractTextContent(msg.content),
        },
      ],
    }));

  return {
    model: "gpt-5",
    instructions,
    input: userMessages,
    store: false,
    stream: true,
    include: ["reasoning.encrypted_content"],
    tools: [SHELL_TOOL, UPDATE_PLAN_TOOL],
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
}

function extractTextContent(content: unknown): string {
  let text = "";

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part && "text" in part) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  } else if (typeof content === "object" && content && "text" in content) {
    text = (content as { text: string }).text;
  } else {
    text = String(content || "");
  }

  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

interface ChatGPTResponseEvent {
  type?: string;
  delta?: string;
  status?: string;
  item?: {
    id?: string;
    type?: string;
    name?: string;
    arguments?: string;
  };
  content?: string;
}

export function transformFromCodexFormat(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const event = item as ChatGPTResponseEvent;

  switch (event.type) {
    case "response.output_text.delta":
      if (event.delta) {
        return {
          choices: [
            {
              delta: {
                content: event.delta,
              },
            },
          ],
        };
      }
      break;

    case "response.output_item.added":
      if (event.item?.type === "function_call") {
        return {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: event.item.id || `call_${Date.now()}`,
                    type: "function",
                    function: {
                      name: "",
                      arguments: "",
                    },
                  },
                ],
              },
            },
          ],
        };
      }
      break;

    case "response.output_item.done":
      if (event.item?.type === "function_call" && event.item.name) {
        return {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: event.item.id,
                    type: "function",
                    function: {
                      name: event.item.name,
                      arguments: event.item.arguments || "",
                    },
                  },
                ],
              },
            },
          ],
        };
      }
      break;

    case "response.completed":
      return {
        choices: [
          {
            delta: {},
            finish_reason: event.status || "stop",
          },
        ],
      };
  }

  if (event.content) {
    return {
      choices: [
        {
          delta: {
            content: event.content,
          },
        },
      ],
    };
  }

  return {
    choices: [
      {
        delta: {},
      },
    ],
  };
}
