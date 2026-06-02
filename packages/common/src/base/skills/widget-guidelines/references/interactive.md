# Interactive Module

Use this module for local interactive explainers and clickable visuals.

- All interactions are local unless the widget deliberately offers a model follow-up action through `window.pochi.sendMessage(prompt)`. Never call other host APIs or request network data.
- Good controls: sliders, segmented buttons, toggles, node selection, hover highlights, step forward/back, reset, and local detail panels.
- Start with useful static content, then enhance with script after streaming completes.
- Bind events with `addEventListener` in a final script. Do not use inline `on*` attributes.
- Put the complete interactive state in the top-level `<pochi-widget state='...'>` JSON attribute. Use `window.pochi.state` to read it and `window.pochi.setState(nextState)` after every meaningful interaction.
- IMPORTANT: Render from `window.pochi.state`, not from separate closure variables. A selected color, active city, highlighted node id, slider value, or current step must be represented in state before the UI updates.
- Use a small `render()` function that reads `const state = window.pochi.state` and derives DOM classes, labels, input values, charts, and button states from that snapshot. Event handlers should compute `nextState`, call `window.pochi.setState(nextState)`, then call `render()` so the state update drives the visible UI.
- For interactive diagrams, clicking a node should update a nearby detail panel and highlight related nodes or edges.
- Follow-up message actions should be explicit buttons or menu items with short, model-authored prompts, for example `window.pochi.sendMessage("show the next 15 days weather for the selected city")`. If the click also changes state, call `window.pochi.setState(nextState)` first. Do not append JSON state to the prompt.

State-driven interaction pattern:

```html
<pochi-widget state='{"hex":"#b87528","alpha":1}'>
  <style>
    .swatch { width: 40px; height: 40px; border-radius: 4px; }
    .colors { display: flex; gap: 6px; margin: 8px 0; }
    .colors button { width: 24px; height: 24px; border: 1px solid var(--vscode-widget-border); }
    .colors button[aria-pressed="true"] { outline: 2px solid var(--vscode-focusBorder); }
  </style>
  <div class="swatch" data-swatch></div>
  <output data-value></output>
  <div class="colors">
    <button type="button" data-color="#b87528" aria-label="Amber"></button>
    <button type="button" data-color="#3d7dd8" aria-label="Blue"></button>
    <button type="button" data-color="#278a63" aria-label="Green"></button>
  </div>
  <input type="range" min="0" max="1" step="0.01" data-alpha>
  <button type="button" data-followup>Generate full picker</button>
</pochi-widget>
<script>
  const widget = document.querySelector("pochi-widget");
  const swatch = widget.querySelector("[data-swatch]");
  const value = widget.querySelector("[data-value]");
  const alpha = widget.querySelector("[data-alpha]");

  function render() {
    const state = window.pochi.state;
    swatch.style.background = state.hex;
    swatch.style.opacity = String(state.alpha);
    value.textContent = `${state.hex} / ${Math.round(state.alpha * 100)}%`;
    alpha.value = String(state.alpha);
    for (const button of widget.querySelectorAll("[data-color]")) {
      button.style.background = button.dataset.color;
      button.setAttribute("aria-pressed", String(button.dataset.color === state.hex));
    }
  }

  for (const button of widget.querySelectorAll("[data-color]")) {
    button.addEventListener("click", () => {
      const nextState = { ...window.pochi.state, hex: button.dataset.color };
      // State update drives UI: write state first, then render from window.pochi.state.
      window.pochi.setState(nextState);
      render();
    });
  }

  alpha.addEventListener("input", () => {
    const nextState = { ...window.pochi.state, alpha: Number(alpha.value) };
    // State update drives UI: write state first, then render from window.pochi.state.
    window.pochi.setState(nextState);
    render();
  });

  widget.querySelector("[data-followup]").addEventListener("click", () => {
    window.pochi.sendMessage("generate a full color picker for the selected color");
  });

  render();
</script>
```
