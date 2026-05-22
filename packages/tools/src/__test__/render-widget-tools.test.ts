import { describe, expect, it } from "vitest";
import {
  createClientTools,
  isReadonlyToolCall,
  selectAgentTools,
} from "../index";

function toolNames(tools: Record<string, unknown>): string[] {
  return Object.keys(tools).sort();
}

describe("render widget tools", () => {
  it("exposes renderWidget as a client tool", () => {
    const tools = createClientTools();

    expect(tools).toHaveProperty("renderWidget");
    expect(tools).not.toHaveProperty("showWidget");
  });

  it("validates generative UI tool schemas", () => {
    const tools = createClientTools();

    expect(() =>
      tools.renderWidget.inputSchema.parse({
        title: "Flow",
        kind: "diagram",
        widgetCode: "<svg></svg>",
      }),
    ).not.toThrow();
    expect(() =>
      tools.renderWidget.inputSchema.parse({
        title: "Flow",
        widgetCode: "<svg></svg>",
        kind: "core",
      }),
    ).toThrow();
  });

  it("treats renderWidget as a readonly UI rendering call", () => {
    expect(
      isReadonlyToolCall("renderWidget", {
        title: "Flow",
        kind: "diagram",
        widgetCode: "<svg></svg>",
      }),
    ).toBe(true);
  });

  it("lets custom agents allow the widget tools explicitly", () => {
    const tools = selectAgentTools({
      agent: {
        name: "visual-agent",
        description: "Generates visual widgets",
        systemPrompt: "Use widgets",
        tools: ["renderWidget"],
      },
      isSubTask: false,
    });

    expect(toolNames(tools)).toEqual(
      ["attemptCompletion", "renderWidget", "todoWrite", "useSkill"].sort(),
    );
  });
});
