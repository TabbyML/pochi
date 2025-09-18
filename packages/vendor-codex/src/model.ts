import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { EventSourceParserStream } from "@ai-sdk/provider-utils";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError, wrapLanguageModel } from "ai";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import type { CodexCredentials } from "./types";

const logger = getLogger("vendor-codex");

// Load Codex instructions from file
function loadCodexInstructions(): string {
  try {
    const instructionsPath = path.join(__dirname, "codex-instructions.txt");
    const content = fs.readFileSync(instructionsPath, "utf-8");
    logger.info(`Loaded instructions from file: ${content.length} characters`);
    logger.info(`First 100 chars: ${content.substring(0, 100)}`);
    return content;
  } catch (error) {
    logger.warn("Failed to load codex-instructions.txt, using fallback", error);
    // Fallback to a minimal instruction set
    return "You are a helpful assistant.";
  }
}

export function createCodexModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const chatgptModel = createOpenAICompatible({
    name: "chatgpt",
    baseURL: "https://chatgpt.com/backend-api",
    apiKey: "placeholder", // Will be overridden by custom fetch
    fetch: createPatchedFetch(
      modelId,
      getCredentials as () => Promise<CodexCredentials>,
    ),
  })(modelId);

  return wrapLanguageModel({
    model: chatgptModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        // Override model to always use gpt-5
        return {
          ...params,
          model: "gpt-5",
          maxOutputTokens: 32768,
        };
      },
    },
  });
}

function createPatchedFetch(
  _model: string,
  getCredentials: () => Promise<CodexCredentials>,
) {
  return (async (
    _requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const { accessToken } = await getCredentials();
    const headers = new Headers(requestInit?.headers);

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    // Extract ChatGPT account ID from JWT
    const accountId = extractAccountId(accessToken);
    logger.debug("Extracted account ID:", accountId);

    // Set required ChatGPT headers
    headers.set("OpenAI-Beta", "responses=experimental");
    headers.set("session_id", crypto.randomUUID());
    headers.set("originator", "codex_cli_rs");

    if (accountId) {
      headers.set("chatgpt-account-id", accountId);
    } else {
      logger.warn("No ChatGPT account ID found in access token");
    }

    // Parse the original request to transform it
    const request = JSON.parse((requestInit?.body as string) || "null");
    logger.debug("Original OpenAI request:", JSON.stringify(request, null, 2));

    // Transform OpenAI format to ChatGPT backend format
    const transformedBody = transformToCodexFormat(request);
    logger.info("Transformed ChatGPT request:", JSON.stringify(transformedBody, null, 2));

    const patchedRequestInit = {
      ...requestInit,
      headers,
      body: JSON.stringify(transformedBody),
    };

    logger.debug("Request headers:", Object.fromEntries(headers.entries()));

    const response = await fetch(
      "https://chatgpt.com/backend-api/codex/responses",
      patchedRequestInit,
    );

    logger.debug("Response status:", response.status);
    logger.debug("Response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("Error response body:", errorBody);
      throw new APICallError({
        message: `Failed to fetch: ${response.status} ${response.statusText} - ${errorBody}`,
        statusCode: response.status,
        url: "",
        requestBodyValues: null,
      });
    }

    if (!response.body) {
      throw new APICallError({
        message: "No response body",
        statusCode: response.status,
        url: "",
        requestBodyValues: null,
      });
    }

    // Transform response stream to OpenAI format
    const body = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .pipeThrough(
        new TransformStream({
          async transform({ data }, controller) {
            try {
              const item = JSON.parse(data);
              // Transform ChatGPT response to OpenAI format
              const openAIResponse = transformFromCodexFormat(item);
              const newChunk = `data: ${JSON.stringify(openAIResponse)}\r\n\r\n`;
              controller.enqueue(newChunk);
            } catch {
              // Ignore parse errors
            }
          },
        }),
      )
      .pipeThrough(new TextEncoderStream());

    return new Response(body, response);
  }) as typeof fetch;
}

/**
 * Transform OpenAI request format to ChatGPT Codex format
 */
function transformToCodexFormat(request: Record<string, unknown>) {
  // Log the original request to debug what parameters we're getting
  logger.debug("Request parameters:", Object.keys(request));

  // Load instructions from file
  const CODEX_INSTRUCTIONS = loadCodexInstructions();

  // Must match exact schema from ChatGPT backend requirements
  const SHELL_TOOL = {
    type: "function",
    name: "shell",
    description: "Runs a shell command and returns its output",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "array",
          items: { type: "string" }
        },
        workdir: {
          type: "string"
        },
        timeout: {
          type: "number"
        }
      },
      required: ["command"],
      additionalProperties: false
    }
  };

  // Must match exact schema and description from requirements
  const UPDATE_PLAN_TOOL = {
    type: "function",
    name: "update_plan",
    description: `Use the update_plan tool to keep the user updated on the current plan for the task.
After understanding the user's task, call the update_plan tool with an initial plan. An example of a plan:
1. Explore the codebase to find relevant files (status: in_progress)
2. Implement the feature in the XYZ component (status: pending)
3. Commit changes and make a pull request (status: pending)
Each step should be a short, 1-sentence description.
Until all the steps are finished, there should always be exactly one in_progress step in the plan.
Call the update_plan tool whenever you finish a step, marking the completed step as \`completed\` and marking the next step as \`in_progress\`.
Before running a command, consider whether or not you have completed the previous step, and make sure to mark it as completed before moving on to the next step.
Sometimes, you may need to change plans in the middle of a task: call \`update_plan\` with the updated plan and make sure to provide an \`explanation\` of the rationale when doing so.
When all steps are completed, call update_plan one last time with all steps marked as \`completed\`.`,
    strict: false,
    parameters: {
      type: "object",
      properties: {
        explanation: {
          type: "string"
        },
        plan: {
          type: "array",
          description: "The list of steps",
          items: {
            type: "object",
            properties: {
              step: { type: "string" },
              status: { type: "string" }
            },
            required: ["step", "status"],
            additionalProperties: false
          }
        }
      },
      required: ["plan"],
      additionalProperties: false
    }
  };

  return {
    model: "gpt-5", // Always use gpt-5 for ChatGPT backend
    instructions: CODEX_INSTRUCTIONS,
    input: (request.messages as Array<{role: string; content: unknown}> || []).map((msg) => ({
      type: "message",
      role: msg.role,
      content: [{
        type: "input_text",
        text: extractTextContent(msg.content)
      }]
    })),
    store: false,
    stream: request.stream || false,
    include: ["reasoning.encrypted_content"],
    tools: [SHELL_TOOL, UPDATE_PLAN_TOOL],
    tool_choice: "auto",
    parallel_tool_calls: false
  };
}

/**
 * Extract text content from message content (handle both string and array formats)
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    // Handle array of content parts
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part && "text" in part) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }

  if (typeof content === "object" && content && "text" in content) {
    return (content as { text: string }).text;
  }

  return String(content || "");
}

/**
 * Transform ChatGPT Codex response to OpenAI format
 */
function transformFromCodexFormat(item: Record<string, unknown>) {
  if (item.content) {
    return {
      choices: [{
        delta: {
          content: item.content
        }
      }]
    };
  }

  return {
    choices: [{
      delta: {}
    }]
  };
}

/**
 * Extract ChatGPT account ID from JWT access token
 */
function extractAccountId(accessToken: string): string {
  try {
    const [, payload] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return claims["https://api.openai.com/auth"]?.chatgpt_account_id || "";
  } catch {
    return "";
  }
}