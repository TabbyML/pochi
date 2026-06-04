import { z } from "zod";
import { defineClientTool } from "./types";

export const renderWidgetInputSchema = z.object({
  title: z.string().describe("Short human-readable title for the widget."),
  widgetCode: z
    .string()
    .describe(
      "HTML/SVG fragment to render. Do not include doctype/html/head/body. Put visible content first and scripts last. Interactive widgets must use Static DOM + render() mutates existing nodes; do not use innerHTML for UI updates.",
    ),
  guidelinesRead: z
    .boolean()
    .refine((val) => val === true, {
      message:
        "Set true only after invoking the `widget-guidelines` skill via the `useSkill` tool and reading the returned guidelines.",
    })
    .describe(
      "Set true only after invoking the `widget-guidelines` skill via the `useSkill` tool and reading the returned guidelines.",
    ),
});

export const renderWidgetOutputSchema = z.object({
  state: z.unknown().describe("JSON-serializable widget UI state."),
});

export const renderWidget = defineClientTool({
  description:
    "Render a local generative UI widget in the VSCode chat. Use this for SVG diagrams, UI mockups, local interactive explainers, charts, and art. Widgets can offer widget-authored follow-up prompts or actions. IMPORTANT: Before calling this tool, use the `useSkill` tool to run `widget-guidelines` and follow the returned widget guidelines.",
  inputSchema: renderWidgetInputSchema,
  outputSchema: renderWidgetOutputSchema,
});
