# Mockup Module

Use this module for UI mockups, forms, cards, dashboards, and bounded records.

- Use VSCode theme variables for surfaces and text. Do not hardcode light-only grays.
- Use compact, flat UI surfaces with 0.5px borders and VSCode theme variables.
- Prefer simple grids, cards, metric blocks, forms, and controls that fit the chat width.
- Use one raised card for bounded objects, but avoid card-inside-card layouts.
- Metric cards should show a muted label and a large formatted value.
- Forms should use native input, select, textarea, button, and range controls with local validation or local visual feedback only.
- Tables with many columns should be avoided in widgets; prefer compact cards or summarize in chat text.
- Use local state in plain JavaScript for controls such as sliders, buttons, toggles, dropdowns, and detail panels.
- For displayed numbers, round or format values with `Intl.NumberFormat`, `toFixed`, or `Math.round`.
