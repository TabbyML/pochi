# Diagram Module

Use this module for SVG flowcharts, structural diagrams, and illustrative diagrams.

## SVG rules

- Prefer inline SVG. Use `<svg width="100%" viewBox="0 0 680 H" role="img" aria-label="...">`; compute `H` from the lowest visual element plus padding.
- The 680px viewBox width is fixed. Keep content inside x=40..640 and never use negative x/y coordinates.
- Put `<defs>` and markers first, then put every visual SVG element in the exact reading order it should appear while streaming.
- For flowcharts, write DOM in logical reveal order: source node group, outgoing connector path, next node group, next connector, then the next node.
- Do not put all arrow paths before all node groups, and do not put a whole row of nodes before the connectors that explain the flow.
- Keep each diagram block self-contained in source order. For a node, emit the group and its visible children together before the connector that leaves it.
- Example source order: `<g class="node c-blue">...step 1...</g>`, then `<path class="arr" .../>`, then `<g class="node c-teal">...step 2...</g>`.
- Every text element needs one class: `t` for 14px primary, `ts` for 12px secondary, or `th` for 14px/500 node headings.
- SVG text never auto-wraps. Keep node titles short and subtitles to five words or fewer.
- Size boxes from the actual text. Leave at least 24-32px horizontal padding, keep labels centered, and widen nodes before text gets cramped.
- Connectors must use `fill="none"` and should not cross unrelated boxes or labels. Use L-shaped paths to route around existing nodes.
- Use `class="arr"` for arrows, `class="leader"` for callout lines, `class="node"` for clickable groups, and `c-blue/c-teal/c-amber/c-green/c-red/c-purple/c-coral/c-pink/c-gray` for themed colored groups.
- Put color classes on the same group as `node`, for example `<g class="node c-blue" data-node-id="..."><rect ... /></g>`.
- Prefer built-in SVG classes instead of redefining `.t`, `.ts`, `.th`, `.arr`, `.node`, or `.c-*`.

## Diagram choices

- Flowcharts: show sequential steps, decision points, and transformations. Prefer one direction, 4-5 nodes, and generous spacing.
- Structural diagrams: show containment and architecture. Use large container rectangles with smaller regions inside; keep nesting to 2-3 levels.
- Illustrative diagrams: show mechanisms and intuition. Draw the thing or visual metaphor, not boxes about the thing.
- For complex topics, split into multiple focused widgets instead of one dense diagram.
