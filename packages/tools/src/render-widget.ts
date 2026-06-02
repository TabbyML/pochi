import { z } from "zod";
import { defineClientTool } from "./types";

export const renderWidgetInputSchema = z.object({
  title: z.string().describe("Short human-readable title for the widget."),
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
  state: z.unknown().describe("JSON-serializable widget UI state."),
});

export const renderWidget = defineClientTool({
  description:
    "Render a local generative UI widget in the VSCode chat. Use this for SVG diagrams, UI mockups, local interactive explainers, charts, and art. Every widget MUST use a top-level <pochi-widget state='{}'> custom element as the single JSON-serializable UI state source; interactive widgets update meaningful state with window.pochi.setState(...). IMPORTANT: render visible UI from window.pochi.state rather than separate hidden state; use a render() function that reads window.pochi.state and derives selected classes, labels, input values, charts, and button states from it. Use window.pochi.sendMessage(prompt) for widget-authored follow-up messages. sendMessage sends only the prompt string; call setState first if the same interaction changes state. The prompt text is authored when generating the widget and should not include serialized state; current state is committed as this tool's output before the next user message. IMPORTANT: Before calling this tool, you MUST first invoke the `useSkill` tool with skill name `widget-guidelines` to fetch the widget guidelines, and then author the widget strictly following those guidelines.",
  inputSchema: renderWidgetInputSchema,
  outputSchema: renderWidgetOutputSchema,
});
