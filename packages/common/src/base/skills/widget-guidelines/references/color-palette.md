# Color Palette

Pick colors from two sources only: the categorical ramps below for diagrams, and VSCode CSS variables for UI surfaces.

## Ramps

Available classnames: `gray`, `purple`, `teal`, `coral`, `pink`, `blue`, `green`, `amber`, `red`.

Apply the class to a `<g>`, `<rect>`, `<circle>`, or `<ellipse>` — not to `<path>`. Dark mode is handled automatically.

Light mode: 50 fill + 600 stroke + 800 title + 600 subtitle.
Dark mode: 800 fill + 200 stroke + 100 title + 200 subtitle.

## Assigning Colors

Color encodes meaning, not order. Group same-category nodes under one ramp, keep 2–3 colors per diagram, and use `gray` for neutral or structural nodes.

Prefer `purple`, `teal`, `coral`, `pink` for general categories. Keep `blue`, `green`, `amber`, `red` for genuine info / success / warning / error meaning (illustrative diagrams may use them for physical properties like temperature).

## Text on Colored Fills

Use the 800/900 stop of the same ramp — never black or `--vscode-foreground` on a colored fill. When a card has both a title and a subtitle, pick two different stops (title 800, subtitle 600 in light; title 100, subtitle 200 in dark).

## UI Surfaces

Use VSCode CSS variables so controls inherit the theme:

```css
input, textarea {
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
