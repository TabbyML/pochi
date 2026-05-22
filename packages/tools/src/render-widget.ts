import { z } from "zod";
import { defineClientTool } from "./types";

const GenerativeUiModuleSchema = z.enum([
  "diagram",
  "mockup",
  "interactive",
  "chart",
  "art",
]);

export const renderWidget = defineClientTool({
  description:
    "Render a Pochi generative UI widget in the VSCode chat. Use this for SVG diagrams, UI mockups, local interactive explainers, charts, and art. The widget must be self-contained HTML/SVG and must not call LLMs, host actions, external APIs, or external resources, except for the approved Chart.js CDN script when chart guidance requires it.",
  inputSchema: z.object({
    title: z.string().describe("Short human-readable title for the widget."),
    kind: GenerativeUiModuleSchema.describe(
      "Closest primary widget kind: diagram, mockup, interactive, chart, or art.",
    ),
    widgetCode: z
      .string()
      .describe(
        "HTML/SVG fragment to render. Do not include doctype/html/head/body. Put visible content first and scripts last.",
      ),
    heightHint: z
      .number()
      .optional()
      .describe("Optional initial iframe height in pixels."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    title: z.string(),
    kind: GenerativeUiModuleSchema,
  }),
});
