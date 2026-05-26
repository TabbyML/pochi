# Chart Module

Use this module for charts and data analysis.

For Chart.js widgets, include the approved CDN script yourself in `widgetCode` before the inline script that creates the chart:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
```

- Use Chart.js for line, bar, area, radar, doughnut, and mixed analytical charts that benefit from axes, legends, tooltips, or responsive canvas rendering.
- Do not use any other CDN, script host, npm package URL, dynamic import, or external URL. Only the exact Chart.js CDN script above is allowed.
- Put a visible chart shell first: title, short subtitle, legend/summary, and `<canvas id="..."></canvas>`. Instantiate Chart.js only in the final script.
- Chart titles should usually be 18-24px, subtitles and axis-adjacent labels 12-14px. Avoid 32px+ dashboard hero numbers unless KPI emphasis is the main point.
- Prefer inline SVG for tiny static charts, custom diagrams, timelines, or charts that need precise source-order streaming.
- Keep legends, filters, and metric summaries in custom HTML around the canvas so the widget has useful visible structure while streaming.
- Round and format every displayed number.
- Use VSCode theme variables for text and surfaces, and explicit readable dataset colors for chart strokes/fills.
- If the chart is interactive, keep interactions local: update the Chart.js instance, toggles, filters, or nearby detail text without network, host actions, or LLM calls.
