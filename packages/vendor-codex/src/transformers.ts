import { DefaultCodexInstructions } from "./constants";

interface CodexRequest {
  model?: string;
  messages?: Array<{ role: string; content: unknown }>;
}

export function transformToCodexFormat(request: Record<string, unknown>) {
  const requestTyped = request as CodexRequest;
  const model = requestTyped.model || "gpt-5";
  const instructions = DefaultCodexInstructions;

  const userMessages = (
    (request.messages as Array<{ role: string; content: unknown }>) || []
  ).map((msg) => ({
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: extractTextContent(msg.content),
      },
    ],
  }));

  return {
    model,
    instructions,
    input: userMessages,
    store: false,
    stream: true,
    include: ["reasoning.encrypted_content"],
    tools: [],
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

  return text;
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
