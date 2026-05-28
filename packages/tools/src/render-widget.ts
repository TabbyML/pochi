import { z } from "zod";
import { defineClientTool } from "./types";

export const renderWidgetInputSchema = z.object({
  widgetCode: z
    .string()
    .describe(
      "HTML/SVG fragment to render. Do not include doctype/html/head/body. Put visible content first and scripts last.",
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
  success: z.boolean(),
});

export const renderWidget = defineClientTool({
  description:
    "Render a local generative UI widget in the VSCode chat. Use this for SVG diagrams, UI mockups, local interactive explainers, charts, and art. IMPORTANT: Before calling this tool, you MUST first invoke the `useSkill` tool with skill name `widget-guidelines` to fetch the widget guidelines, and then author the widget strictly following those guidelines.",
  inputSchema: renderWidgetInputSchema,
  outputSchema: renderWidgetOutputSchema,
});
