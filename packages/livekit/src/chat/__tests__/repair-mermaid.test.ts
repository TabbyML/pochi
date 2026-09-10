import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: generateTextMock,
  };
});

import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LiveKitStore, Message } from "../../types";
import { repairMermaid } from "../llm/repair-mermaid";

const BrokenChart = "graph TD\n  A --> ";
const FixedChart = "graph TD\n  A --> B";

function brokenBlock(chart = BrokenChart) {
  return `\`\`\`mermaid\n${chart}\n\`\`\``;
}

function createStore() {
  return {
    storeId: "store-1",
    commit: vi.fn(),
  } as unknown as LiveKitStore & { commit: ReturnType<typeof vi.fn> };
}

async function runRepair(messages: Message[]) {
  const store = createStore();
  await repairMermaid({
    store,
    taskId: "task-1",
    model: {} as LanguageModelV3,
    messages,
    chart: BrokenChart,
    error: "Parse error",
  });
  return store;
}

function repairedParts(store: { commit: ReturnType<typeof vi.fn> }) {
  const event = store.commit.mock.calls[0]?.[0];
  return event?.args?.repairs as { id: string; parts: unknown[] }[];
}

describe("repairMermaid", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({
      text: `\`\`\`mermaid\n${FixedChart}\n\`\`\``,
    });
  });

  it("repairs charts in text parts", async () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [{ type: "text", text: `Here you go:\n\n${brokenBlock()}\n` }],
      },
    ] as unknown as Message[];

    const store = await runRepair(messages);

    expect(repairedParts(store)).toEqual([
      {
        id: "m1",
        parts: [
          {
            type: "text",
            text: `Here you go:\n\n${brokenBlock(FixedChart)}\n`,
          },
        ],
      },
    ]);
  });

  it("repairs charts in attemptCompletion inputs", async () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-attemptCompletion",
            toolCallId: "t1",
            state: "input-available",
            input: { result: `Done\n\n${brokenBlock()}` },
          },
        ],
      },
    ] as unknown as Message[];

    const store = await runRepair(messages);

    expect(repairedParts(store)[0].parts[0]).toMatchObject({
      type: "tool-attemptCompletion",
      toolCallId: "t1",
      input: { result: `Done\n\n${brokenBlock(FixedChart)}` },
    });
  });

  it("repairs charts nested in askFollowupQuestion inputs", async () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-askFollowupQuestion",
            toolCallId: "t1",
            state: "input-available",
            input: {
              questions: [
                {
                  header: "Approach",
                  question: `Which flow?\n\n${brokenBlock()}`,
                  options: [{ label: "A" }, { label: "B" }],
                },
              ],
            },
          },
        ],
      },
    ] as unknown as Message[];

    const store = await runRepair(messages);

    expect(repairedParts(store)[0].parts[0]).toMatchObject({
      type: "tool-askFollowupQuestion",
      toolCallId: "t1",
      input: {
        questions: [
          {
            header: "Approach",
            question: `Which flow?\n\n${brokenBlock(FixedChart)}`,
            options: [{ label: "A" }, { label: "B" }],
          },
        ],
      },
    });
  });

  it("repairs every occurrence across messages and parts", async () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `${brokenBlock()}\nand again\n${brokenBlock()}`,
          },
          { type: "text", text: "untouched" },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "reasoning", text: brokenBlock() }],
      },
    ] as unknown as Message[];

    const store = await runRepair(messages);

    const repairs = repairedParts(store);
    expect(repairs).toHaveLength(2);
    expect(repairs[0].parts).toEqual([
      {
        type: "text",
        text: `${brokenBlock(FixedChart)}\nand again\n${brokenBlock(FixedChart)}`,
      },
      { type: "text", text: "untouched" },
    ]);
    expect(repairs[1].parts).toEqual([
      { type: "reasoning", text: brokenBlock(FixedChart) },
    ]);
  });

  it("keeps `$` sequences of the fixed chart verbatim", async () => {
    const chartWithDollar = 'graph TD\n  A["$&"] --> B';
    generateTextMock.mockResolvedValue({
      text: `\`\`\`mermaid\n${chartWithDollar}\n\`\`\``,
    });

    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [{ type: "text", text: brokenBlock() }],
      },
    ] as unknown as Message[];

    const store = await runRepair(messages);

    expect(repairedParts(store)[0].parts[0]).toEqual({
      type: "text",
      text: brokenBlock(chartWithDollar),
    });
  });

  it("throws when no message holds the chart", async () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [{ type: "text", text: "no diagram here" }],
      },
    ] as unknown as Message[];

    await expect(runRepair(messages)).rejects.toThrow(
      "Message containing mermaid chart not found",
    );
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
