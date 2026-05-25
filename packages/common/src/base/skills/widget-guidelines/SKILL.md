---
name: widget-guidelines
description: |
  Use before renderWidget when the user needs a Pochi visual widget, SVG diagram, UI mockup, chart, local interactive explainer, or generative art.
---

# Widget Guidelines

Skip `renderWidget` entirely if a plain-text answer would communicate just as well. When a widget is the right call, follow the platform contract below and read the visual contract before generating output.

## Platform Contract

These rules apply to every `renderWidget` call:

- Output only an HTML/SVG fragment. Do not include `<!doctype>`, `<html>`, `<head>`, or `<body>` tags.
- Pochi streams `widgetCode` as the model generates it. Put visible structure first and scripts last.
- The widget runs in a sandboxed iframe inside VSCode. Interactivity must stay local to the widget.
- Do not use `sendPrompt`, host actions, external APIs, or external data requests.
- Do not use `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, form submission, or external image/font URLs.
- The only external script allowed is the approved Chart.js CDN script in `references/chart.md`.
- Do not use inline event attributes such as `onclick` or `oninput`. Bind events in the final script with `addEventListener`.
- Keep the outer container transparent and in normal document flow. Do not use `position: fixed` or nested scrolling.
- Use VSCode/Pochi CSS variables for text, surfaces, borders, and fonts. Every color must remain readable in light and dark themes.
- Match Pochi's VSCode web UI typography scale: 12px for captions and meta text, 14px for normal body and labels, 16px for section titles, 18px for compact widget headings, and 24px only for major chart or dashboard titles with enough space.
- Use font-weight 500 for most labels and headings, 600 only for strong emphasis or primary metrics. Avoid oversized 32px+ hero typography inside chat widgets.
- Use sentence case labels. Keep text short inside visuals; put prose explanations in the chat response outside `renderWidget`.

## Reference Loading

1. Always read `references/color-palette.md` before generating any widget — it is the visual contract (ramps and CSS variables).
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
