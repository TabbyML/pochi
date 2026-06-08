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
- Every widget must have one top-level `<pochi-widget state='...'>` element. Static widgets can use `state='{}'`; interactive widgets must put the complete UI state needed to interpret the current display in that JSON attribute.
- Keep widget state JSON-serializable. On every meaningful interaction, compute `nextState`, call `window.pochi.setState(nextState)`, then render the visible UI from `window.pochi.state` so the host can persist the latest state.
- IMPORTANT: Treat `window.pochi.state` as the only UI state source of truth. Use the Static DOM + `render()` mutates existing nodes pattern to make that relationship obvious: build the visible shell and controls as static DOM first, then make `render()` read from `window.pochi.state` and mutate existing nodes with `textContent`, `classList`, `style`, `value`, `checked`, `hidden`, and ARIA attributes. Do not use `innerHTML` or `insertAdjacentHTML` to update UI, generate lists, swap icons, or replace cards; predeclare the needed DOM nodes and mutate them instead. Do not keep separate hidden state that can drift from the visible UI.
- Keep all widget controls local: update `window.pochi.state` and re-render existing UI only.
- Do not use other host actions, external APIs, or external data requests.
- Do not use `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, form submission, or external image/font URLs.
- The only external script allowed is the approved Chart.js CDN script in `references/chart.md`.
- Do not use inline event attributes such as `onclick` or `oninput`. Bind events in the final script with `addEventListener`.
- Keep the outer container transparent and in normal document flow. Do not use `position: fixed` or nested scrolling.
- Use VSCode/Pochi CSS variables for text, surfaces, borders, and fonts. Every color must remain readable in light and dark themes.
- Match Pochi's VSCode web UI typography scale: 12px for captions and meta text, 14px for normal body and labels, 16px for section titles, 18px for compact widget headings, and 24px only for major chart or dashboard titles with enough space.
- Use font-weight 500 for most labels and headings, 600 only for strong emphasis or primary metrics. Avoid oversized 32px+ hero typography inside chat widgets.
- Use sentence case labels. Keep text short inside visuals; put prose explanations in the chat response outside `renderWidget`.

## Core Design Principles

These rules apply to every widget:

- Make the widget feel native to Pochi and VSCode. Use transparent outer containers, compact spacing, flat surfaces, and theme variables instead of decorative backgrounds.
- Keep prose outside the widget. Use the chat response for explanations, summaries, introductions, and caveats; use `widgetCode` only for the visual or local control surface.
- Build for streaming. Put a short `<style>` first only when needed, then visible HTML/SVG structure, and put scripts last. The user should see useful structure before JavaScript runs.
- Avoid decorative gradients, shadows, blur, glow, noise, or oversized hero typography. Use visual weight for meaning, not ornament.
- Do not hide primary content behind tabs, carousels, or `display: none` during streaming. Post-stream local steppers are fine when all controls and state are local.
- Keep content in normal flow and auto-height. Avoid fixed overlays, nested scrolling, and layout that depends on a viewport outside the iframe.

## Visual Contract

Pick colors from two sources by default: the diagram color classes below, and VSCode CSS variables for UI surfaces. The only exception is an illustrative physical scene where theme inversion would be misleading, such as heat, water, flame, or material color; keep those hardcoded colors local and consistent.

### Diagram Color Classes

Available color classnames: `gray`, `purple`, `teal`, `coral`, `pink`, `blue`, `green`, `amber`, `red`.

Apply the class to a `<g>` that directly contains the colored `<rect>`, `<circle>`, or `<ellipse>` and the child `.t`, `.ts`, or `.th` text.

### Palette Levels

Palette levels describe tone inside one color family. Lower numbers are lighter; higher numbers are darker. They explain the hex values that the widget host applies internally; they are not CSS class names, CSS variables, or SVG attribute values. Do not copy the palette table into `widgetCode` or write numbered palette names in generated SVG.

| Color | 50 | 100 | 200 | 400 | 600 | 800 | 900 |
|---|---|---|---|---|---|---|---|
| `purple` | `#EEEDFE` | `#CECBF6` | `#AFA9EC` | `#7F77DD` | `#534AB7` | `#3C3489` | `#26215C` |
| `teal` | `#E1F5EE` | `#9FE1CB` | `#5DCAA5` | `#1D9E75` | `#0F6E56` | `#085041` | `#04342C` |
| `coral` | `#FAECE7` | `#F5C4B3` | `#F0997B` | `#D85A30` | `#993C1D` | `#712B13` | `#4A1B0C` |
| `pink` | `#FBEAF0` | `#F4C0D1` | `#ED93B1` | `#D4537E` | `#993556` | `#72243E` | `#4B1528` |
| `gray` | `#F1EFE8` | `#D3D1C7` | `#B4B2A9` | `#888780` | `#5F5E5A` | `#444441` | `#2C2C2A` |
| `blue` | `#E6F1FB` | `#B5D4F4` | `#85B7EB` | `#378ADD` | `#185FA5` | `#0C447C` | `#042C53` |
| `green` | `#EAF3DE` | `#C0DD97` | `#97C459` | `#639922` | `#3B6D11` | `#27500A` | `#173404` |
| `amber` | `#FAEEDA` | `#FAC775` | `#EF9F27` | `#BA7517` | `#854F0B` | `#633806` | `#412402` |
| `red` | `#FCEBEB` | `#F7C1C1` | `#F09595` | `#E24B4A` | `#A32D2D` | `#791F1F` | `#501313` |

When using built-in diagram color classes, choose only the plain color class. Pochi maps palette levels to roles automatically:

| Theme | Shape fill | Shape stroke | `.th` / `.t` text | `.ts` text |
|---|---|---|---|---|
| Light | 50, the pale fill | 600, the strong border | 800, dark same-family title text | 600, medium same-family subtitle text |
| Dark | 800, the dark fill | 200, the light border | 100, light same-family title text | 200, light same-family subtitle text |

In generated SVG, write `class="blue"` or `class="teal"` on the owning group; do not write numbered palette names.

Palette levels are useful only when reasoning about diagram contrast or hand-picked physical colors. For HTML controls, panels, and UI surfaces, use VSCode CSS variables instead.

- `50`: pale fill on light themes.
- `100` / `200`: light text or stroke on dark fills.
- `400`: mid accent, rarely needed in widgets.
- `600`: strong border or secondary text on pale fills.
- `800` / `900`: dark text on pale fills; use `900` only when extra contrast is needed.

### Assigning Colors

Color encodes meaning, not order. Group same-category nodes under one color class, keep 2–3 colors per diagram, and use `gray` for neutral or structural nodes.

Prefer `purple`, `teal`, `coral`, `pink` for general categories. Use `gray` for neutral or structural content. Keep `blue`, `green`, `amber`, `red` for genuine info / success / warning / error meaning; illustrative diagrams may also use them for physical properties like cold, organic growth, heat, pressure, danger, or error.

### Text on Colored Fills

Built-in diagram color classes already choose same-family text colors for `.t`, `.ts`, and `.th`. If an illustrative physical scene needs hardcoded colors, keep text in the same color family with strong contrast; never place black or generic `--vscode-foreground` text on a colored fill.

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

Before composing `widgetCode`, choose and read at least one relevant reference module. Read multiple modules when the widget spans categories. Pick only what the task actually needs.

- `references/diagram.md`: SVG flowcharts, structural diagrams, and illustrative diagrams.
- `references/mockup.md`: UI mockups, forms, cards, dashboards, and bounded records.
- `references/interactive.md`: local controls, clickable explainers, and interactive diagrams.
- `references/chart.md`: Chart.js, inline SVG charts, and analytical visualizations.
- `references/art.md`: illustrations and generative art.

Example combinations:

- clickable flowchart → `diagram + interactive`
- dashboard chart → `chart + mockup`
- chart with filters or toggles → `chart + interactive`
