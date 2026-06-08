# Interactive Module

Use this module for local interactive explainers and clickable visuals.

- All interactions are local. Never call host APIs, send chat messages, or request network data.
- Good controls: sliders, segmented buttons, toggles, node selection, hover highlights, step forward/back, reset, and local detail panels.
- Start with useful static content, then enhance with script after streaming completes.
- Bind events with `addEventListener` in a final script. Do not use inline `on*` attributes.
- Put the complete interactive state in the top-level `<pochi-widget state='...'>` JSON attribute. Use `window.pochi.state` to read it and `window.pochi.setState(nextState)` after every meaningful interaction.
- IMPORTANT: Render from `window.pochi.state`, not from separate closure variables. A selected color, active city, highlighted node id, slider value, or current step must be represented in state before the UI updates.
- Use the Static DOM + `render()` mutates existing nodes pattern. Write the visible widget shell and controls directly in HTML so streaming preview remains useful before scripts run.
- Use a small `render()` function that reads `const state = window.pochi.state` and updates existing nodes with `textContent`, `classList`, `style`, `value`, `checked`, `hidden`, and ARIA attributes. Do not use `innerHTML` or `insertAdjacentHTML` to update UI, generate lists, swap icons, or replace cards; predeclare the needed DOM nodes and mutate them instead.
- Event handlers should compute `nextState`, call `window.pochi.setState(nextState)`, then call `render()` so the state update drives the visible UI.
- For interactive diagrams, clicking a node should update a nearby detail panel and highlight related nodes or edges.
- Keep buttons, menus, and node clicks local to the widget. They may update state and visible UI, but they must not send chat messages.

Static DOM state-driven interaction pattern:

```html
<pochi-widget state='{"city":"san-francisco","unit":"celsius","showDetails":true}'>
  <style>
    .weather-widget { display: grid; gap: 10px; color: var(--vscode-foreground); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .toolbar button { border: 1px solid var(--vscode-widget-border); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; padding: 3px 8px; }
    .toolbar button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .summary { border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 10px; background: var(--vscode-editorWidget-background); }
    .metric { font-size: 24px; font-weight: 600; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .details[hidden] { display: none; }
  </style>
  <section class="weather-widget">
    <div class="toolbar" aria-label="Cities">
      <button type="button" data-city="san-francisco" aria-pressed="true">San Francisco</button>
      <button type="button" data-city="london">London</button>
      <button type="button" data-city="paris">Paris</button>
    </div>

    <div class="toolbar" aria-label="Display options">
      <button type="button" data-unit="celsius" aria-pressed="true">C</button>
      <button type="button" data-unit="fahrenheit">F</button>
      <label class="muted">
        <input type="checkbox" data-details-toggle checked>
        Details
      </label>
    </div>

    <section class="summary">
      <div class="muted" data-city-label>San Francisco</div>
      <div class="metric" data-temperature>18 C</div>
      <div data-condition>Foggy</div>
      <div class="details" data-details>
        <p class="muted" data-note>Cool marine air with a soft west wind.</p>
      </div>
    </section>

  </section>
</pochi-widget>
<script>
  const widget = document.querySelector("pochi-widget");
  const cityButtons = Array.from(widget.querySelectorAll("[data-city]"));
  const unitButtons = Array.from(widget.querySelectorAll("[data-unit]"));
  const detailsToggle = widget.querySelector("[data-details-toggle]");
  const cityLabel = widget.querySelector("[data-city-label]");
  const temperature = widget.querySelector("[data-temperature]");
  const condition = widget.querySelector("[data-condition]");
  const details = widget.querySelector("[data-details]");
  const note = widget.querySelector("[data-note]");

  const weather = {
    "san-francisco": { label: "San Francisco", celsius: 18, condition: "Foggy", note: "Cool marine air with a soft west wind." },
    london: { label: "London", celsius: 16, condition: "Cloudy", note: "Muted light with a chance of light rain." },
    paris: { label: "Paris", celsius: 22, condition: "Sunny", note: "Mild afternoon warmth with clear breaks." },
  };

  function formatTemp(celsius, unit) {
    return unit === "fahrenheit"
      ? `${Math.round((celsius * 9) / 5 + 32)} F`
      : `${celsius} C`;
  }

  function render() {
    const state = window.pochi.state;
    const city = weather[state.city] || weather["san-francisco"];

    for (const button of cityButtons) {
      const selected = button.dataset.city === state.city;
      button.setAttribute("aria-pressed", String(selected));
    }

    for (const button of unitButtons) {
      const selected = button.dataset.unit === state.unit;
      button.setAttribute("aria-pressed", String(selected));
    }

    detailsToggle.checked = Boolean(state.showDetails);
    details.hidden = !state.showDetails;

    cityLabel.textContent = city.label;
    temperature.textContent = formatTemp(city.celsius, state.unit);
    condition.textContent = city.condition;
    note.textContent = city.note;
  }

  for (const button of cityButtons) {
    button.addEventListener("click", () => {
      const nextState = { ...window.pochi.state, city: button.dataset.city };
      window.pochi.setState(nextState);
      render();
    });
  }

  for (const button of unitButtons) {
    button.addEventListener("click", () => {
      const nextState = { ...window.pochi.state, unit: button.dataset.unit };
      window.pochi.setState(nextState);
      render();
    });
  }

  detailsToggle.addEventListener("change", () => {
    const nextState = { ...window.pochi.state, showDetails: detailsToggle.checked };
    window.pochi.setState(nextState);
    render();
  });

  render();
</script>
```
