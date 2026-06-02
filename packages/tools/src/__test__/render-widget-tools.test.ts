import { describe, expect, it } from "vitest";
import {
  createClientTools,
  isReadonlyToolCall,
  selectAgentTools,
} from "../index";
import {
  renderWidgetInputSchema,
  renderWidgetOutputSchema,
} from "../render-widget";

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
    const inputProperties = renderWidgetInputSchema.toJSONSchema().properties;
    const outputProperties = renderWidgetOutputSchema.toJSONSchema().properties;

    expect(() =>
      renderWidgetInputSchema.parse({
        title: "Flow",
        widgetCode: "<svg></svg>",
        guidelinesRead: true,
      }),
    ).not.toThrow();
    expect(() =>
      renderWidgetInputSchema.parse({
        title: "Flow",
        widgetCode: "<svg></svg>",
      }),
    ).toThrow();
    expect(() =>
      renderWidgetInputSchema.parse({
        title: "Flow",
        widgetCode: "<svg></svg>",
        guidelinesRead: false,
      }),
    ).toThrow();
    expect(() =>
      renderWidgetInputSchema.parse({
        widgetCode: "<svg></svg>",
        guidelinesRead: true,
      }),
    ).toThrow();
    expect(inputProperties).toHaveProperty("title");
    expect(inputProperties).toHaveProperty("widgetCode");
    expect(inputProperties).toHaveProperty("guidelinesRead");
    expect(outputProperties).toHaveProperty("state");
    expect(outputProperties).not.toHaveProperty("success");
    expect(() =>
      renderWidgetOutputSchema.parse({
        state: { hex: "#b87528" },
      }),
    ).not.toThrow();
  });

  it("treats renderWidget as a readonly UI rendering call", () => {
    expect(
      isReadonlyToolCall("renderWidget", {
        title: "Flow",
        widgetCode: "<svg></svg>",
        guidelinesRead: true,
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
