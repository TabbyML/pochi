# Diagram Module

Use this module for SVG flowcharts, structural diagrams, and illustrative diagrams.

## SVG setup

- Prefer one raw inline `<svg width="100%" viewBox="0 0 680 H" role="img" aria-label="...">` for static diagrams. For interactive diagrams, put the SVG first, controls below it, and scripts last.
- The viewBox width is fixed at 680. Do not shrink it for narrow content; center narrow diagrams inside x=40..640.
- Compute `H` from the lowest visual element plus 20-40px padding. Do not guess, clip content, or leave large empty space.
- Keep structural content inside x=40..640 and y>=40. Never use negative x/y coordinates.
- Put `<defs>` first, then visual elements in the reading order they should stream. Do not emit all boxes first and all arrows later; the reveal should build the explanation step by step.
- Include this marker when arrows are needed, then set `marker-end="url(#arrow)"` on connector lines or paths:

```svg
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
</defs>
```

Tiny streaming-order example:

```svg
<g class="gray">
  <rect x="80" y="40" width="160" height="44" rx="8"/>
  <text class="th" x="160" y="62" text-anchor="middle" dominant-baseline="central">Raw input</text>
</g>
<line class="arr" x1="240" y1="62" x2="300" y2="62" marker-end="url(#arrow)"/>
<g class="blue">
  <rect x="300" y="40" width="160" height="44" rx="8"/>
  <text class="th" x="380" y="62" text-anchor="middle" dominant-baseline="central">Process</text>
</g>
```

## Pre-built SVG classes

These classes are already loaded by the Pochi widget host. Prefer them instead of redefining SVG typography, arrows, and node colors.

| Class | Meaning |
|---|---|
| `t` | 14px primary SVG text |
| `ts` | 12px secondary SVG text |
| `th` | 14px medium-weight SVG heading text |
| `box` | Neutral rectangle fill and border |
| `node` | Selectable/clickable group affordance with pointer cursor and hover dimming |
| `arr` | Arrow/connector line: secondary stroke, 1.5px, `fill: none` |
| `leader` | Dashed callout line: secondary stroke, 0.5px, dashed, `fill: none` |
| `blue`, `teal`, `amber`, `green`, `red`, `purple`, `coral`, `pink`, `gray` | Theme-aware color groups for direct child shapes and text |

Put color classes on the innermost `<g>` that directly contains the colored shape and its text. Add `node` only when the group has local selection or click behavior.

```svg
<g class="blue">
  <rect x="80" y="40" width="180" height="56" rx="8" stroke-width="0.5"/>
  <text class="th" x="170" y="58" text-anchor="middle" dominant-baseline="central">Parse input</text>
  <text class="ts" x="170" y="76" text-anchor="middle" dominant-baseline="central">Validate shape</text>
</g>
```

The color selectors use direct children. If a `<g class="blue">` contains another nested `<g>`, the nested rect/text will not receive the palette. Put the color class on the nested group that directly owns the shapes, or keep the shape and text as direct children.

## Text and sizing

- Every `<text>` element must use `class="t"`, `class="ts"`, or `class="th"`.
- Use only 14px text for node/region labels (`t` or `th`) and 12px text for subtitles, descriptions, legends, and callouts (`ts`).
- SVG text does not auto-wrap. Every line break needs an explicit `<tspan>`, but long subtitles should usually be shortened instead.
- Size boxes from the longest label before drawing the rect: `width >= max(title_chars * 8, subtitle_chars * 7) + 24`.
- Use 24-32px horizontal padding, 12px minimum between text and edges, and 22px between title and subtitle baselines.
- Use `dominant-baseline="central"` for centered text. For a rect at `(x, y, w, h)`, center single-line text at `x + w / 2`, `y + h / 2`.
- Be careful with `text-anchor="end"` near the left edge. Text extends left from its x coordinate and can clip out of the viewBox.
- Use sentence case. Avoid decorative step numbers, oversized headings, icons inside boxes, and rotated text.

## Geometry checks

- Before drawing a connector, trace it against every box already placed. If it crosses an unrelated box or label, route around with an L-shaped `<path>`.
- Connector `<line>`, `<path>`, and `<polyline>` elements must have `fill="none"` unless `class="arr"` or `class="leader"` already supplies it.
- Stop connector endpoints at component edges. Do not draw through shapes and rely on fills to hide the line.
- For rows, check total width before placing: sum node widths plus gaps must fit within x=40..640.
- Use 60px minimum gaps between flowchart nodes when possible and leave about 10px between arrowheads and box edges.
- Use `rx="4"` for subtle rect rounding and `rx="8"` for emphasized nodes. Pill shapes should be deliberate.
- Use 0.5px strokes for box borders and structural edges unless a semantic emphasis needs more.

## Diagram choices

Pick the diagram type by user intent, not by subject name.

- Flowcharts show sequential steps, decisions, and transformations. Use them for "what are the steps", "walk me through the flow", and lifecycle questions.
- Structural diagrams show containment, architecture, and where things live. Use them for "what is inside", "how is this organized", and system maps.
- Illustrative diagrams show mechanism and intuition. Use them for "how does this actually work", "explain this", and "give me an intuition".

Do not mix diagram families in one SVG. If a topic needs both intuition and reference detail, make separate focused widgets with prose between them. For complex topics, split into multiple diagrams instead of cramming 6+ components and many arrows into one canvas.

## Flowcharts

- Prefer one direction: left-to-right or top-to-bottom.
- Keep most flowcharts to 4-5 nodes. If there are more components, make a simplified overview first and separate sub-flow diagrams later.
- Use same-height nodes for the same content type: about 44px for a single-line node and 56px for title plus subtitle.
- Avoid arrow labels unless there is clear empty space. Put meaning in the source/target labels or in the chat prose.
- Do not draw cycles as rings. For rich cycles, use an interactive stepper from `references/interactive.md`; for simple feedback, use a short return marker or local note instead of a long arrow across the layout.

## Structural diagrams

- Use large rounded rectangles as containers and smaller rectangles as regions. Keep nesting to 2-3 levels.
- Leave at least 20px padding inside every container and 16px gaps between inner regions.
- Use distinct but restrained color ramps so nested regions remain visible. Reusing the same color for parent and child flattens the hierarchy.
- Put only text inside structural regions: a short name and a short description. Avoid icons, miniature flowcharts, and decorative object drawings inside containers.
- For schematic boundaries such as services, vessels, networks, or zones, prefer a dashed labeled rect over literal cloud/organelle/server illustrations.
- Put external inputs/outputs outside the main container with short labels and arrows that stop at the container edge.

## Illustrative diagrams

- Draw the mechanism, not boxes about the mechanism. Physical subjects can use simplified cross-sections; abstract subjects should use a spatial metaphor that explains the behavior.
- Layout should follow the subject geometry. A tall object can be tall; a wide system can be wide, while still keeping the 680px viewBox width.
- Color encodes intensity or state in illustrative diagrams: warm colors for active/hot/high-pressure, cool or gray for inactive/cold/structural.
- Shape overlap is allowed when it communicates the mechanism, but text must never be crossed by strokes. Move labels to quiet regions instead of masking lines with background fills.
- Put labels outside the drawn object when possible and connect them with `leader` lines. Prefer one label side, usually the right side with `text-anchor="start"`.
- Simple indicators such as particles, bubbles, flames, heat waves, or vibration lines are allowed only when they explain state.
- Avoid decorative gradients. A single `<linearGradient>` is acceptable only when it represents a continuous physical property such as temperature or pressure.
- If a mechanism has meaningful controls, prefer an interactive widget with local sliders, toggles, buttons, and `addEventListener` bindings. Do not use inline `on*` attributes.

## Mermaid and schemas

Do not load Mermaid.js inside `renderWidget`; widget CSP and sanitization only allow the approved Chart.js script. If an ERD or class diagram is better represented by Mermaid, put a Markdown `mermaid` code block in the chat response instead of using `renderWidget`. For diagrams that must live inside a widget, use carefully planned inline SVG.
