import { z } from "zod";
import { defineClientTool } from "./types";

const GenerativeUiModuleSchema = z.enum([
  "diagram",
  "mockup",
  "interactive",
  "chart",
  "art",
]);

export const renderWidgetInputSchema = z.object({
  title: z.string().describe("Short human-readable title for the widget."),
  kind: GenerativeUiModuleSchema.describe(
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
      "Set true only after reading the relevant widget guidelines for the selected kind.",
    ),
});

export const renderWidgetOutputSchema = z.object({
  success: z.boolean(),
  title: z.string(),
});

export const renderWidget = defineClientTool({
  description:
    "Render a local generative UI widget in the VSCode chat. Use this for SVG diagrams, UI mockups, local interactive explainers, charts, and art. Read the relevant widget guidelines before calling this tool. The widget must be self-contained HTML/SVG and must not call LLMs, host actions, external APIs, or external resources, except for the approved Chart.js CDN script when chart guidance requires it.",
  inputSchema: renderWidgetInputSchema,
  outputSchema: renderWidgetOutputSchema,
});
