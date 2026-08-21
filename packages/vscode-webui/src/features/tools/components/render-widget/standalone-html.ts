import {
  ChartJsCdnOrigin,
  ChartJsCdnScriptSrc,
  WidgetBaseStyles,
  type WidgetScript,
  type WidgetThemeClass,
  WidgetThemeStyleId,
  createWidgetScriptNonce,
  escapeHtmlAttribute,
  escapeInlineScriptContent,
  extractWidgetScripts,
  sanitizeWidgetFragment,
  stripRunnableScripts,
} from "./utils";

export interface StandaloneWidgetHtmlOptions {
  /** Used as the document title. */
  title: string;
  /** The raw `renderWidget` input, i.e. an HTML/SVG fragment. */
  widgetCode: string;
  /** Widget state snapshot baked into the top level `<pochi-widget>`. */
  state?: unknown;
  themeClass?: WidgetThemeClass;
  /** `:root { ... }` block produced by `collectWidgetThemeVariables()`. */
  themeVariablesCss?: string;
}

/**
 * Builds a self-contained HTML document that renders a widget outside of the
 * chat: no bidc channel, no streaming, no host bridge. The widget markup, its
 * state snapshot and the resolved theme variables are all inlined, so the file
 * stays interactive when opened from disk or in a plain webview panel.
 */
export function buildStandaloneWidgetHtml({
  title,
  widgetCode,
  state,
  themeClass = "dark",
  themeVariablesCss = "",
}: StandaloneWidgetHtmlOptions) {
  const sanitized = sanitizeWidgetFragment(widgetCode);
  const scripts = extractWidgetScripts(sanitized);
  const markup = injectWidgetState(stripRunnableScripts(sanitized), state);
  const nonce = createWidgetScriptNonce();
  const safeNonce = escapeHtmlAttribute(nonce);
  const safeThemeVariablesCss = themeVariablesCss.replace(
    /<\/style>/gi,
    "<\\/style>",
  );

  return `<!doctype html>
<html class="${escapeHtmlAttribute(themeClass)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${safeNonce}' ${ChartJsCdnScriptSrc} 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src ${ChartJsCdnOrigin}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; font-src 'none'">
<title>${escapeHtmlAttribute(title)}</title>
<style id="${WidgetThemeStyleId}">
${safeThemeVariablesCss}
</style>
<style>
${WidgetBaseStyles}
/* standalone overrides */
html, body {
  overflow: auto;
  background: var(--vscode-editor-background, #1e1e1e) !important;
}
body {
  padding: 16px 20px;
  min-height: 100vh;
}
</style>
</head>
<body>
<div id="root">${markup}</div>
<script nonce="${safeNonce}">${StandaloneWidgetRuntimeCode}</script>
${renderWidgetScriptElements(scripts, safeNonce)}
</body>
</html>
`;
}

function injectWidgetState(markup: string, state: unknown) {
  if (state === undefined) return markup;

  const serializedState = safeStringifyState(state);
  if (serializedState === undefined) return markup;

  const template = document.createElement("template");
  template.innerHTML = markup;
  const widget = Array.from(template.content.children).find(
    (child) => child.tagName.toLowerCase() === "pochi-widget",
  );
  if (!widget) return markup;

  widget.setAttribute("state", serializedState);
  return template.innerHTML;
}

function safeStringifyState(state: unknown) {
  try {
    return JSON.stringify(state);
  } catch {
    return undefined;
  }
}

function renderWidgetScriptElements(
  scripts: WidgetScript[],
  safeNonce: string,
) {
  return scripts
    .map((script) =>
      script.type === "external"
        ? `<script src="${escapeHtmlAttribute(script.src)}"></script>`
        : `<script nonce="${safeNonce}">(function(){\n${escapeInlineScriptContent(script.code)}\n})();</script>`,
    )
    .join("\n");
}

/**
 * Mirrors `ensurePochiWidgetElementDefined()` and `installPochiWidgetStateRuntime()`
 * from `renderer-runtime.ts`, minus the parent channel reporting. It has to be
 * shipped as source text because the exported document runs outside of this
 * bundle, and it must run before the widget scripts, which read and write
 * `window.pochi.state`.
 */
const StandaloneWidgetRuntimeCode = `
(function () {
  if (typeof customElements !== "undefined" && !customElements.get("pochi-widget")) {
    class PochiWidgetElement extends HTMLElement {
      get state() {
        return JSON.parse(this.getAttribute("state") || "{}");
      }

      set state(nextState) {
        this.setAttribute("state", JSON.stringify(nextState ?? {}));
        this.dispatchEvent(
          new CustomEvent("pochi-state-change", { detail: { state: nextState } }),
        );
      }
    }

    customElements.define("pochi-widget", PochiWidgetElement);
  }

  var root = document.getElementById("root");
  var widget = root
    ? Array.prototype.find.call(root.children, function (child) {
        return child.tagName.toLowerCase() === "pochi-widget";
      })
    : undefined;
  var detachedState = {};

  window.pochi = {
    get state() {
      if (!widget) return detachedState;
      try {
        return JSON.parse(widget.getAttribute("state") || "{}");
      } catch (error) {
        return {};
      }
    },
    setState: function (nextState) {
      if (!widget) {
        detachedState = nextState;
        return;
      }
      widget.state = nextState;
    },
  };
})();
`;
