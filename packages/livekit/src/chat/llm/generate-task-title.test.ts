import { describe, expect, it, vi } from "vitest";
import type { BlobStore } from "../../blob-store";
import type { LiveKitStore, Message } from "../../types";
import { generateTaskTitle } from "./generate-task-title";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("ai")>();
  return {
    ...original,
    generateText: generateTextMock,
  };
});

const unusedStore = {} as LiveKitStore;
const unusedBlobStore = {} as BlobStore;

describe("generateTaskTitle pasted text fallback", () => {
  it("uses a bounded pasted-text preview when there is no typed prompt", async () => {
    const text = `  ${"x".repeat(100)}  `;
    const messages: Message[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "data-pasted-text", data: { text } }],
      },
    ];

    const title = await generateTaskTitle({
      store: unusedStore,
      blobStore: unusedBlobStore,
      taskId: "task-1",
      title: null,
      messages,
      getModel: vi.fn(),
    });

    expect(title).toBe(`${"x".repeat(79)}…`);
  });

  it("does not split a Unicode character in the pasted-text preview", async () => {
    const messages: Message[] = [
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "data-pasted-text", data: { text: "😀".repeat(100) } },
        ],
      },
    ];

    const title = await generateTaskTitle({
      store: unusedStore,
      blobStore: unusedBlobStore,
      taskId: "task-1",
      title: null,
      messages,
      getModel: vi.fn(),
    });

    expect(title).toBe(`${"😀".repeat(79)}…`);
  });

  it("prefers the typed prompt over pasted text", async () => {
    const messages: Message[] = [
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "Analyze these logs" },
          {
            type: "data-pasted-text",
            data: { text: "serialized message list" },
          },
        ],
      },
    ];

    const title = await generateTaskTitle({
      store: unusedStore,
      blobStore: unusedBlobStore,
      taskId: "task-1",
      title: null,
      messages,
      getModel: vi.fn(),
    });

    expect(title).toBe("Analyze these logs");
  });

  it("sends only a bounded pasted-text preview to the title model", async () => {
    const text = "x".repeat(6_000);
    const fallbackTitle = `${"x".repeat(79)}…`;
    const messages: Message[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "data-pasted-text", data: { text } }],
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `assistant-${index}`,
        role: "assistant" as const,
        metadata: {
          kind: "assistant" as const,
          totalTokens: 1,
          finishReason: "stop" as const,
        },
        parts: [{ type: "text" as const, text: `response ${index}` }],
      })),
    ];
    generateTextMock.mockResolvedValueOnce({ text: "Generated title" });

    await generateTaskTitle({
      store: unusedStore,
      blobStore: unusedBlobStore,
      taskId: "task-1",
      title: fallbackTitle,
      messages,
      getModel: vi.fn(() => ({}) as never),
    });

    const prompt = generateTextMock.mock.calls[0]?.[0]?.prompt;
    expect(JSON.stringify(prompt)).not.toContain(text);
    expect(JSON.stringify(prompt)).toContain(fallbackTitle);
  });
});
