import type { PochiRequestUseCase } from "@getpochi/common";
import { asSchema, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { FlexibleChatTransport } from "../flexible-chat-transport";

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

async function getToolDefinitions(requestUseCase: PochiRequestUseCase) {
  const transport = new FlexibleChatTransport({
    store: { storeId: "test" } as never,
    blobStore: {} as never,
    getters: { getLLM: () => ({ id: "test" }) as never },
    requestUseCase,
    isSubTask: false,
  });
  await transport.sendMessages({
    trigger: "submit-message",
    chatId: "task",
    messageId: undefined,
    messages: [
      {
        id: "prompt",
        role: "user",
        parts: [{ type: "text", text: "Work" }],
      },
    ],
    abortSignal: undefined,
  });
  const tools = vi.mocked(streamText).mock.calls.at(-1)?.[0].tools;
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
  it.each(["task-memory", "auto-memory", "auto-memory-dream"] as const)(
    "%s preserves parent tool schemas and descriptions",
    async (requestUseCase) => {
      const parentTools = await getToolDefinitions("agent");
      const forkTools = await getToolDefinitions(requestUseCase);
      expect(JSON.stringify(forkTools)).toBe(JSON.stringify(parentTools));
    },
  );
});
