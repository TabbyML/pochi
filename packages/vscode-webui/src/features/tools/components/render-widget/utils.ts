export type WidgetRenderMode = "preview" | "finalize";

export type WidgetThemeClass = "dark" | "light";

export type PendingWidgetRenderMessage = {
  type: string;
  html: string;
  animateReveal?: boolean;
};

export const ChartJsCdnScriptSrc =
  "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";
export const ChartJsCdnOrigin = "https://cdn.jsdelivr.net";

export const WidgetThemeStyleId = "pochi-widget-theme";
const WidgetScriptNonceByteLength = 16;

export type WidgetScript =
  | { type: "external"; src: string }
  | { type: "inline"; code: string };

export type WidgetRendererScript =
  | string
  | {
      src: string;
      code?: string;
      nonce?: string;
    };

export function coalescePendingWidgetMessage<
  T extends PendingWidgetRenderMessage,
>(current: T | undefined, next: T): T;
export function coalescePendingWidgetMessage<
  Current extends PendingWidgetRenderMessage,
  Next extends PendingWidgetRenderMessage,
>(current: Current | undefined, next: Next): Current | Next;
export function coalescePendingWidgetMessage(
  current: PendingWidgetRenderMessage | undefined,
  next: PendingWidgetRenderMessage,
) {
  if (current?.type === next.type && current.html === next.html) {
    if (Boolean(current.animateReveal) === Boolean(next.animateReveal)) {
      return current;
    }
    return current.animateReveal ? current : next;
  }

  return next;
}

export function shouldAnimateWidgetReveal({
  isExecuting,
  isLoading,
  isLastPart,
}: {
  isExecuting: boolean;
  isLoading: boolean;
  isLastPart?: boolean;
}) {
  return isExecuting || (isLoading && Boolean(isLastPart));
}

export function selectWidgetRevealElements(elements: Element[]) {
  const seen = new Set<Element>();
  return elements.filter((element) => isWidgetRevealElement(element, seen));
}

export function collectWidgetRevealElements(addedElements: Element[]) {
  const candidates: Element[] = [];
  const seen = new Set<Element>();
  for (const element of addedElements) {
    if (!seen.has(element)) {
      seen.add(element);
      candidates.push(element);
    }
    for (const descendant of Array.from(element.querySelectorAll("*"))) {
      if (seen.has(descendant)) continue;
      seen.add(descendant);
      candidates.push(descendant);
    }
  }

  return selectWidgetRevealElements(candidates);
}

export function measureWidgetContentHeight(
  root: HTMLElement,
  body: HTMLElement = document.body,
) {
  const rootHeight = root.getBoundingClientRect().height;
  if (rootHeight <= 0 && !root.hasChildNodes()) return 0;

  const bodyStyles = getComputedStyle(body);
  const paddingTop = Number.parseFloat(bodyStyles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(bodyStyles.paddingBottom) || 0;

  return Math.max(0, Math.ceil(rootHeight + paddingTop + paddingBottom));
}

function isWidgetRevealElement(element: Element, seen: Set<Element>) {
  if (seen.has(element)) return false;
  seen.add(element);

  const tagName = element.tagName.toUpperCase();
  if (isNonVisualSvgElement(tagName)) return false;
  return !hasNonVisualSvgAncestor(element);
}

function hasNonVisualSvgAncestor(element: Element) {
  for (
    let parent = element.parentElement;
    parent && parent.tagName.toUpperCase() !== "SVG";
    parent = parent.parentElement
  ) {
    if (isNonVisualSvgElement(parent.tagName.toUpperCase())) return true;
  }
  return false;
}

function isNonVisualSvgElement(tagName: string) {
  return [
    "STYLE",
    "SCRIPT",
    "DEFS",
    "MARKER",
    "CLIPPATH",
    "MASK",
    "PATTERN",
    "TITLE",
    "DESC",
  ].includes(tagName);
}

const ForbiddenTags = [
  "base",
  "embed",
  "form",
  "iframe",
  "link",
  "meta",
  "object",
];

export function prepareWidgetHtml(html: string, mode: WidgetRenderMode) {
  const safeHtml =
    mode === "preview" ? stripFromLastUnclosedScript(html) : html;
  const withoutScripts =
    mode === "preview" ? stripRunnableScripts(safeHtml) : safeHtml;
  return sanitizeWidgetFragment(withoutScripts);
}

export function stripRunnableScripts(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

export function extractWidgetScripts(html: string): WidgetScript[] {
  const scripts: WidgetScript[] = [];
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const script of template.content.querySelectorAll("script")) {
    const src = script.getAttribute("src");
    if (src) {
      if (isAllowedWidgetExternalScriptSrc(src)) {
        scripts.push({ type: "external", src });
      }
      continue;
    }
    scripts.push({ type: "inline", code: script.textContent ?? "" });
  }

  return scripts;
}

export function isAllowedWidgetExternalScriptSrc(src: string) {
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      url.hostname === "cdn.jsdelivr.net" &&
      url.pathname === "/npm/chart.js@4.5.1/dist/chart.umd.min.js"
    );
  } catch {
    return false;
  }
}

function stripFromLastUnclosedScript(html: string) {
  const lastOpen = html.toLowerCase().lastIndexOf("<script");
  if (lastOpen === -1) return html;

  const lastClose = html.toLowerCase().lastIndexOf("</script>");
  if (lastClose < lastOpen) {
    return html.slice(0, lastOpen);
  }

  return html;
}

export function sanitizeWidgetFragment(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const tag of ForbiddenTags) {
    for (const element of template.content.querySelectorAll(tag)) {
      element.remove();
    }
  }

  for (const script of template.content.querySelectorAll("script[src]")) {
    const src = script.getAttribute("src");
    if (!src || !isAllowedWidgetExternalScriptSrc(src)) {
      script.remove();
    }
  }

  for (const element of template.content.querySelectorAll("*")) {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();

      if (name.startsWith("on")) {
        element.removeAttribute(attr.name);
        continue;
      }

      if (
        (name === "href" || name === "src" || name === "xlink:href") &&
        (value.startsWith("javascript:") ||
          value.startsWith("http:") ||
          value.startsWith("https:") ||
          value.startsWith("//")) &&
        !(element.tagName.toLowerCase() === "script" && name === "src")
      ) {
        element.removeAttribute(attr.name);
      }
    }
  }

  return template.innerHTML;
}

/**
 * Detects the current VSCode webview theme. VSCode injects `vscode-dark` /
 * `vscode-light` onto the `<body>` element; we fall back to `<html>` for
 * development environments that mirror the class on the root. Returns the
 * simplified `"dark"` / `"light"` token that we propagate into the iframe.
 */
export function getCurrentWidgetThemeClass(
  fallback: WidgetThemeClass = "dark",
): WidgetThemeClass {
  const targets: Element[] = [];
  if (typeof document !== "undefined") {
    if (document.body) targets.push(document.body);
    if (document.documentElement) targets.push(document.documentElement);
  }
  for (const target of targets) {
    if (target.classList.contains("vscode-light")) return "light";
    if (target.classList.contains("vscode-dark")) return "dark";
  }
  return fallback;
}

/**
 * Collects VSCode + Pochi CSS custom properties from both `<body>` (where
 * VSCode injects them at runtime) and `<html>` (where dev environments mirror
 * them via `theme-provider`). Variables defined on body win because that is
 * the authoritative source in real VSCode webviews.
 */
export function collectWidgetThemeVariables() {
  const seen = new Set<string>();
  const lines: string[] = [];
  const targets: Element[] = [];
  if (typeof document !== "undefined") {
    if (document.body) targets.push(document.body);
    if (document.documentElement) targets.push(document.documentElement);
  }

  for (const target of targets) {
    const styles = getComputedStyle(target);
    for (let i = 0; i < styles.length; i++) {
      const name = styles.item(i);
      if (seen.has(name)) continue;
      if (!name.startsWith("--vscode-") && !name.startsWith("--pochi-")) {
        continue;
      }

      const value = styles.getPropertyValue(name).trim();
      if (!value) continue;

      seen.add(name);
      lines.push(`  ${name}: ${escapeCssVariableValue(value)};`);
    }
  }

  if (lines.length === 0) return "";
  return `:root {\n${lines.join("\n")}\n}`;
}

function escapeCssVariableValue(value: string) {
  return value.replace(/[;\n\r]/g, " ");
}

export function buildWidgetIframeSrc(html: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function buildWidgetIframeDocument(
  rendererScript: WidgetRendererScript,
  themeVariablesCss = "",
  channelId = "pochi-widget",
  themeClass: WidgetThemeClass = "dark",
) {
  const rendererScriptSrc =
    typeof rendererScript === "string" ? rendererScript : rendererScript.src;
  const rendererScriptCode =
    typeof rendererScript === "string" ? undefined : rendererScript.code;
  const rendererScriptNonce =
    typeof rendererScript === "string" ? undefined : rendererScript.nonce;
  const inlineRendererScriptNonce = rendererScriptCode
    ? rendererScriptNonce || createWidgetScriptNonce()
    : undefined;
  const resolvedRendererScriptSrc = normalizeWidgetModuleScriptSrc(
    resolveWidgetModuleScriptSrc(rendererScriptSrc),
  );
  const safeThemeVariablesCss = themeVariablesCss.replace(
    /<\/style>/gi,
    "<\\/style>",
  );
  const safeRendererScriptSrc = resolvedRendererScriptSrc.replace(
    /"/g,
    "&quot;",
  );
  const safeChannelId = escapeHtmlAttribute(channelId);
  const safeThemeClass = escapeHtmlAttribute(themeClass);
  const scriptCspSource =
    rendererScriptCode && inlineRendererScriptNonce
      ? `'nonce-${inlineRendererScriptNonce}'`
      : getScriptCspSource(resolvedRendererScriptSrc);
  const connectCspSource = getWidgetConnectCspSource(resolvedRendererScriptSrc);
  const rendererScriptElement =
    rendererScriptCode && inlineRendererScriptNonce
      ? `<script nonce="${escapeHtmlAttribute(inlineRendererScriptNonce)}">${escapeInlineScriptContent(rendererScriptCode)}</script>`
      : `<script type="module" src="${safeRendererScriptSrc}"></script>`;

  return `<!doctype html>
<html class="${safeThemeClass}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${scriptCspSource} ${ChartJsCdnScriptSrc} 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src ${connectCspSource}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; font-src 'none'">
<style id="${WidgetThemeStyleId}">
${safeThemeVariablesCss}
</style>
<style>
${WidgetBaseStyles}
</style>
</head>
<body>
<div id="root" data-channel-id="${safeChannelId}" aria-label="sandboxed generative UI widget"></div>
${rendererScriptElement}
</body>
</html>`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeInlineScriptContent(code: string) {
  return code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

function createWidgetScriptNonce() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(WidgetScriptNonceByteLength);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, formatNonceByte).join("");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function formatNonceByte(byte: number) {
  return byte.toString(16).padStart(2, "0");
}

function resolveWidgetModuleScriptSrc(scriptSrc: string) {
  const baseHref =
    document.querySelector("base")?.href ||
    document.baseURI ||
    window.location.href;
  return new URL(scriptSrc, baseHref).toString();
}

export function normalizeWidgetModuleScriptSrc(scriptSrc: string) {
  try {
    const url = new URL(scriptSrc);
    if (
      url.searchParams.has("worker_file") &&
      url.searchParams.get("type") === "module"
    ) {
      url.search = "";
    }
    return url.toString();
  } catch {
    return scriptSrc;
  }
}

function getScriptCspSource(scriptSrc: string) {
  try {
    const url = new URL(scriptSrc);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `${url.protocol}//${url.host}`;
    }
    return `${url.protocol}`;
  } catch {
    return "'self'";
  }
}

function getWidgetConnectCspSource(scriptSrc: string) {
  const sources = [ChartJsCdnOrigin];
  try {
    const url = new URL(scriptSrc);
    if (
      url.protocol === "http:" &&
      ["localhost", "localhost.", "127.0.0.1", "0.0.0.0", "[::1]"].includes(
        url.hostname,
      )
    ) {
      sources.unshift(`${url.protocol}//${url.host}`);
    }
  } catch {
    // Keep the sandbox network-closed when the script URL is not parseable.
  }

  return sources.join(" ");
}

const WidgetBaseStyles = `
* { box-sizing: border-box; }
html { background: transparent !important; }
.light body { color-scheme: light; }
.dark body { color-scheme: dark; }
body {
  margin: 0;
  padding: 4px 0;
  overflow: hidden;
  background: transparent !important;
  color: var(--vscode-editor-foreground, #cccccc);
  font-family: var(--vscode-font-family, system-ui, sans-serif);
}
#root {
  display: block;
  width: 100%;
  min-height: 0;
}
@keyframes __pochi_widget_fade_in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes __pochi_widget_svg_fade_in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.__pochi_widget_appear {
  animation: __pochi_widget_fade_in 450ms ease-out both;
  animation-delay: var(--pochi-widget-appear-delay, 0ms);
}
svg .__pochi_widget_appear {
  animation: __pochi_widget_svg_fade_in 450ms ease-out both;
  animation-delay: var(--pochi-widget-appear-delay, 0ms);
}
svg {
  max-width: 100%;
  height: auto;
  display: block;
}
:where(svg .t)  { font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 14px; fill: var(--vscode-editor-foreground, #cccccc); }
:where(svg .ts) { font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 12px; fill: var(--vscode-descriptionForeground, #9d9d9d); }
:where(svg .th) { font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 14px; font-weight: 500; fill: var(--vscode-editor-foreground, #cccccc); }
:where(svg .box) { fill: var(--vscode-editorWidget-background, transparent); stroke: var(--vscode-widget-border, currentColor); }
:where(svg .node) { cursor: pointer; }
:where(svg .node:hover) { opacity: 0.82; }
:where(svg .arr) { stroke: var(--vscode-descriptionForeground, #9d9d9d); stroke-width: 1.5; fill: none; }
:where(svg .leader) { stroke: var(--vscode-descriptionForeground, #9d9d9d); stroke-width: 0.5; stroke-dasharray: 4 3; fill: none; }


/* Diagram palette */
.dark svg .blue { --pochi-svg-fill: #0C447C; --pochi-svg-stroke: #85B7EB; --pochi-svg-title: #B5D4F4; --pochi-svg-subtitle: #85B7EB; }
.dark svg .teal { --pochi-svg-fill: #085041; --pochi-svg-stroke: #5DCAA5; --pochi-svg-title: #9FE1CB; --pochi-svg-subtitle: #5DCAA5; }
.dark svg .amber { --pochi-svg-fill: #633806; --pochi-svg-stroke: #EF9F27; --pochi-svg-title: #FAC775; --pochi-svg-subtitle: #EF9F27; }
.dark svg .green { --pochi-svg-fill: #27500A; --pochi-svg-stroke: #97C459; --pochi-svg-title: #C0DD97; --pochi-svg-subtitle: #97C459; }
.dark svg .red { --pochi-svg-fill: #791F1F; --pochi-svg-stroke: #F09595; --pochi-svg-title: #F7C1C1; --pochi-svg-subtitle: #F09595; }
.dark svg .purple { --pochi-svg-fill: #3C3489; --pochi-svg-stroke: #AFA9EC; --pochi-svg-title: #CECBF6; --pochi-svg-subtitle: #AFA9EC; }
.dark svg .coral { --pochi-svg-fill: #712B13; --pochi-svg-stroke: #F0997B; --pochi-svg-title: #F5C4B3; --pochi-svg-subtitle: #F0997B; }
.dark svg .pink { --pochi-svg-fill: #72243E; --pochi-svg-stroke: #ED93B1; --pochi-svg-title: #F4C0D1; --pochi-svg-subtitle: #ED93B1; }
.dark svg .gray { --pochi-svg-fill: #444441; --pochi-svg-stroke: #B4B2A9; --pochi-svg-title: #D3D1C7; --pochi-svg-subtitle: #B4B2A9; }

.light svg .blue { --pochi-svg-fill: #E6F1FB; --pochi-svg-stroke: #185FA5; --pochi-svg-title: #0C447C; --pochi-svg-subtitle: #185FA5; }
.light svg .teal { --pochi-svg-fill: #E1F5EE; --pochi-svg-stroke: #0F6E56; --pochi-svg-title: #085041; --pochi-svg-subtitle: #0F6E56; }
.light svg .amber { --pochi-svg-fill: #FAEEDA; --pochi-svg-stroke: #854F0B; --pochi-svg-title: #633806; --pochi-svg-subtitle: #854F0B; }
.light svg .green { --pochi-svg-fill: #EAF3DE; --pochi-svg-stroke: #3B6D11; --pochi-svg-title: #27500A; --pochi-svg-subtitle: #3B6D11; }
.light svg .red { --pochi-svg-fill: #FCEBEB; --pochi-svg-stroke: #A32D2D; --pochi-svg-title: #791F1F; --pochi-svg-subtitle: #A32D2D; }
.light svg .purple { --pochi-svg-fill: #EEEDFE; --pochi-svg-stroke: #534AB7; --pochi-svg-title: #3C3489; --pochi-svg-subtitle: #534AB7; }
.light svg .coral { --pochi-svg-fill: #FAECE7; --pochi-svg-stroke: #993C1D; --pochi-svg-title: #712B13; --pochi-svg-subtitle: #993C1D; }
.light svg .pink { --pochi-svg-fill: #FBEAF0; --pochi-svg-stroke: #993556; --pochi-svg-title: #72243E; --pochi-svg-subtitle: #993556; }
.light svg .gray { --pochi-svg-fill: #F1EFE8; --pochi-svg-stroke: #5F5E5A; --pochi-svg-title: #444441; --pochi-svg-subtitle: #5F5E5A; }

:where(svg .blue, svg .teal, svg .amber, svg .green, svg .red, svg .purple, svg .coral, svg .pink, svg .gray) > :where(rect, circle, ellipse) { fill: var(--pochi-svg-fill); stroke: var(--pochi-svg-stroke); }
:where(svg .blue, svg .teal, svg .amber, svg .green, svg .red, svg .purple, svg .coral, svg .pink, svg .gray) > :where(.th, .t) { fill: var(--pochi-svg-title); }
:where(svg .blue, svg .teal, svg .amber, svg .green, svg .red, svg .purple, svg .coral, svg .pink, svg .gray) > .ts { fill: var(--pochi-svg-subtitle); }
`;
