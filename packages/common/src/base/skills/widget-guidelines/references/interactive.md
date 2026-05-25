# Interactive Module

Use this module for local interactive explainers and clickable visuals.

- All interactions are local. They must not ask the model, call host APIs, or request network data.
- Good controls: sliders, segmented buttons, toggles, node selection, hover highlights, step forward/back, reset, and local detail panels.
- Start with useful static content, then enhance with script after streaming completes.
- Bind events with `addEventListener` in a final script. Do not use inline `on*` attributes.
- Keep runtime state inside the widget script. Use stable element ids or data attributes for updates.
- For interactive diagrams, clicking a node should update a nearby detail panel and highlight related nodes or edges.
