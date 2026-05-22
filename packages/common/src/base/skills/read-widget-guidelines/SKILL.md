---
name: read-widget-guidelines
description: |
  Use before renderWidget when the user needs a Pochi visual widget, SVG diagram, UI mockup, chart, local interactive explainer, or generative art.
compatibility: Pochi VSCode chat with the renderWidget tool
---

# Read Widget Guidelines

Read the reference modules below before calling `renderWidget`. Skip the tool entirely if a plain-text answer would communicate just as well.

## Reference Loading

1. Always read `references/platform.md` first — it is the platform contract for every `renderWidget` call.
2. Then read one or more of the modules below. Pick only what the task actually needs; combine modules when the widget spans multiple categories.

   - `references/diagram.md`: SVG flowcharts, structural diagrams, and illustrative diagrams.
   - `references/mockup.md`: UI mockups, forms, cards, dashboards, and bounded records.
   - `references/interactive.md`: local controls, clickable explainers, and interactive diagrams.
   - `references/chart.md`: Chart.js, inline SVG charts, and analytical visualizations.
   - `references/art.md`: illustrations and generative art.

   Example combinations:

   - clickable flowchart → `diagram + interactive`
   - dashboard chart → `chart + mockup`
   - chart with filters or toggles → `chart + interactive`

## Output

Call `renderWidget` with a self-contained `widgetCode` HTML/SVG fragment:

- Do not include `<!doctype>`, `<html>`, `<head>`, or `<body>` tags.
- Put visible HTML/SVG/CSS first and scripts last so streamed widgets show useful structure before interactivity runs.
