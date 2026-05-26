---
name: widget-guidelines
description: Use before renderWidget when the user needs a visual widget, SVG diagram, UI mockup, chart, local interactive explainer, or generative art.
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

## Visual Contract

Pick colors from two sources only: the diagram color classes below, and VSCode CSS variables for UI surfaces.

### Diagram Color Classes

Available color classnames: `gray`, `purple`, `teal`, `coral`, `pink`, `blue`, `green`, `amber`, `red`.

Apply the class to a `<g>`, `<rect>`, `<circle>`, or `<ellipse>` — not to `<path>`. Dark mode is handled automatically.

Light mode: 50 fill + 600 stroke + 800 title + 600 subtitle.
Dark mode: 800 fill + 200 stroke + 100 title + 200 subtitle.

### Assigning Colors

Color encodes meaning, not order. Group same-category nodes under one color class, keep 2–3 colors per diagram, and use `gray` for neutral or structural nodes.

Prefer `purple`, `teal`, `coral`, `pink` for general categories. Keep `blue`, `green`, `amber`, `red` for genuine info / success / warning / error meaning (illustrative diagrams may use them for physical properties like temperature).

### Text on Colored Fills

Use the 800/900 stop of the same color family — never black or `--vscode-foreground` on a colored fill. When a card has both a title and a subtitle, pick two different stops (title 800, subtitle 600 in light; title 100, subtitle 200 in dark).

### VSCode CSS Variables

Use these common variables for UI widgets:

- Base colors: `--vscode-foreground`, `--vscode-disabledForeground`, `--vscode-descriptionForeground`, `--vscode-errorForeground`, `--vscode-focusBorder`, `--vscode-widget-border`, `--vscode-widget-shadow`, `--vscode-selection-background`, `--vscode-icon-foreground`.
- Text colors: `--vscode-textLink-foreground`, `--vscode-textLink-activeForeground`, `--vscode-textCodeBlock-background`, `--vscode-textSeparator-foreground`.
- Action colors: `--vscode-toolbar-hoverBackground`, `--vscode-toolbar-hoverOutline`, `--vscode-toolbar-activeBackground`.
- Button controls: `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-button-border`, `--vscode-button-hoverBackground`, `--vscode-button-secondaryBackground`, `--vscode-button-secondaryForeground`, `--vscode-button-secondaryHoverBackground`, `--vscode-checkbox-background`, `--vscode-checkbox-foreground`, `--vscode-checkbox-border`.
- Dropdown controls: `--vscode-dropdown-background`, `--vscode-dropdown-foreground`, `--vscode-dropdown-border`, `--vscode-dropdown-listBackground`.
- Input controls: `--vscode-input-background`, `--vscode-input-foreground`, `--vscode-input-border`, `--vscode-input-placeholderForeground`, `--vscode-inputOption-activeBackground`, `--vscode-inputOption-activeForeground`, `--vscode-inputOption-activeBorder`, `--vscode-inputOption-hoverBackground`.
- Badges: `--vscode-badge-background`, `--vscode-badge-foreground`.
- Lists and trees: `--vscode-list-hoverBackground`, `--vscode-list-hoverForeground`, `--vscode-list-activeSelectionBackground`, `--vscode-list-activeSelectionForeground`, `--vscode-list-inactiveSelectionBackground`, `--vscode-list-inactiveSelectionForeground`, `--vscode-list-focusBackground`, `--vscode-list-focusForeground`, `--vscode-list-focusOutline`, `--vscode-list-highlightForeground`, `--vscode-list-errorForeground`, `--vscode-list-warningForeground`, `--vscode-tree-indentGuidesStroke`.

Example CSS for common controls:

```css
input,
select,
textarea {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  padding: 4px 6px;
  font-family: var(--vscode-font-family);
}

button {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 12px;
  cursor: pointer;
}

button:hover {
  background: var(--vscode-button-hoverBackground);
}
```

## Reference Loading

Read one or more of the modules below before generating a widget. Pick only what the task actually needs; combine modules when the widget spans multiple categories.

- `references/diagram.md`: SVG flowcharts, structural diagrams, and illustrative diagrams.
- `references/mockup.md`: UI mockups, forms, cards, dashboards, and bounded records.
- `references/interactive.md`: local controls, clickable explainers, and interactive diagrams.
- `references/chart.md`: Chart.js, inline SVG charts, and analytical visualizations.
- `references/art.md`: illustrations and generative art.

Example combinations:

- clickable flowchart → `diagram + interactive`
- dashboard chart → `chart + mockup`
- chart with filters or toggles → `chart + interactive`
