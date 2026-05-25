import { z } from "zod";
import { defineClientTool } from "./types";

export const renderWidgetInputSchema = z.object({
  title: z.string().describe("Short human-readable title for the widget."),
  kind: z
    .enum(["diagram", "mockup", "interactive", "chart", "art"])
    .describe(
      "Closest primary widget kind: diagram, mockup, interactive, chart, or art.",
    ),
  widgetCode: z
    .string()
    .describe(
      "HTML/SVG fragment to render. Do not include doctype/html/head/body. Put visible content first and scripts last.",
    ),
  guidelinesRead: z
    .literal(true)
    .describe(
      "Set true only after invoking the `widget-guidelines` skill via the `useSkill` tool and reading the returned guidelines for the selected kind.",
    ),
});

export const renderWidgetOutputSchema = z.object({
  success: z.boolean(),
  title: z.string(),
});

export const renderWidget = defineClientTool({
  description:
    "Render a local generative UI widget in the VSCode chat. Use this for SVG diagrams, UI mockups, local interactive explainers, charts, and art. IMPORTANT: Before calling this tool, you MUST first invoke the `useSkill` tool with skill name `widget-guidelines` to fetch the widget guidelines, and then author the widget strictly following those guidelines.",
  inputSchema: renderWidgetInputSchema,
  outputSchema: renderWidgetOutputSchema,
});
