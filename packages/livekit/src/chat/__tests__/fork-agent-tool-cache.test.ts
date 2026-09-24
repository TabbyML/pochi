import type { PochiRequestUseCase } from "@getpochi/common";
import { asSchema, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { FlexibleChatTransport } from "../flexible-chat-transport";
import { createForkAgent } from "../../background-task/fork-agent";
import type { Message } from "../../types";

vi.mock("../models", () => ({
  createModel: () => ({
    specificationVersion: "v3",
    provider: "test",
    modelId: "test",
    supportedUrls: {},
  }),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: vi.fn(() => ({
    toUIMessageStream: () =>
      new ReadableStream({ start: (controller) => controller.close() }),
  })),
}));

async function getRequest(
  requestUseCase: PochiRequestUseCase,
  messages: Message[] = [
    {
      id: "prompt",
      role: "user",
      parts: [{ type: "text", text: "Work" }],
    },
  ],
  systemPromptOverride?: string,
) {
  const transport = new FlexibleChatTransport({
    store: { storeId: "test" } as never,
    blobStore: {} as never,
    getters: { getLLM: () => ({ id: "test" }) as never },
    requestUseCase,
    isSubTask: false,
    systemPromptOverride,
  });
  await transport.sendMessages({
    trigger: "submit-message",
    chatId: "task",
    messageId: undefined,
    messages,
    abortSignal: undefined,
  });
  return vi.mocked(streamText).mock.calls.at(-1)![0];
}

async function getToolDefinitions(requestUseCase: PochiRequestUseCase) {
  const { tools } = await getRequest(requestUseCase);
  expect(tools?.executeCommand).toBeDefined();
  return Promise.all(
    Object.entries(tools ?? {}).map(async ([name, definition]) => ({
      name,
      description: definition.description,
      inputSchema: await asSchema(definition.inputSchema).jsonSchema,
    })),
  );
}

describe("fork agent tool cache", () => {
  it("preserves the parent model-message prefix when Dream appends its directive", async () => {
    const messages = [
      {
        id: "parent-user",
        role: "user",
        parts: [{ type: "text", text: "Keep the existing API." }],
      },
      {
        id: "parent-assistant",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-writeToFile",
            toolCallId: "write",
            state: "output-available",
            input: { path: "api.ts", content: "export const api = 1;" },
            output: { success: true },
          },
          { type: "text", text: "Implemented." },
        ],
      },
    ] as Message[];
    const parent = await getRequest("agent", messages);
    const agent = createForkAgent({
      label: "auto-memory-dream",
      parentMessages: messages,
      parentCwd: "/repo",
      directive: "Consolidate long-term memory.",
      maxSteps: 20,
    });
    const dream = await getRequest(
      "auto-memory-dream",
      agent.initMessages,
      parent.system as string,
    );
    expect(dream.system).toEqual(parent.system);
    expect(JSON.stringify(dream.messages?.slice(0, -1))).toBe(
      JSON.stringify(parent.messages),
    );
    expect(dream.messages?.at(-1)).toMatchObject({ role: "user" });
  });

  it.each(["task-memory", "auto-memory", "auto-memory-dream"] as const)(
    "%s preserves parent tool schemas and descriptions",
    async (requestUseCase) => {
      const parentTools = await getToolDefinitions("agent");
      const forkTools = await getToolDefinitions(requestUseCase);
      expect(JSON.stringify(forkTools)).toBe(JSON.stringify(parentTools));
    },
  );
});
