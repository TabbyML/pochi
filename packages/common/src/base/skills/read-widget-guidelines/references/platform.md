# Pochi Widget Platform Contract

These rules apply to every `renderWidget` call.

- Output only an HTML/SVG fragment. Do not include doctype, html, head, or body tags.
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
