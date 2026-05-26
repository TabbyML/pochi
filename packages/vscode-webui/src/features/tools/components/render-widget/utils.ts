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
  const bodyStyles = getComputedStyle(body);
  const paddingTop = Number.parseFloat(bodyStyles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(bodyStyles.paddingBottom) || 0;

  return Math.max(120, Math.ceil(rootHeight + paddingTop + paddingBottom));
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
export function getCurrentWidgetThemeClass(): WidgetThemeClass {
  const targets: Element[] = [];
  if (typeof document !== "undefined") {
    if (document.body) targets.push(document.body);
    if (document.documentElement) targets.push(document.documentElement);
  }
  for (const target of targets) {
    if (target.classList.contains("vscode-light")) return "light";
    if (target.classList.contains("vscode-dark")) return "dark";
  }
  return "dark";
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
    rendererScriptCode && rendererScriptNonce
      ? `'nonce-${rendererScriptNonce}'`
      : getScriptCspSource(resolvedRendererScriptSrc);
  const connectCspSource = getWidgetConnectCspSource(resolvedRendererScriptSrc);
  const rendererScriptElement =
    rendererScriptCode && rendererScriptNonce
      ? `<script nonce="${escapeHtmlAttribute(rendererScriptNonce)}">${escapeInlineScriptContent(rendererScriptCode)}</script>`
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
  padding: 12px 0;
  overflow: hidden;
  background: transparent !important;
  color: var(--vscode-editor-foreground, #cccccc);
  font-family: var(--vscode-font-family, system-ui, sans-serif);
}
#root {
  display: block;
  width: 100%;
  min-height: 96px;
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
  animation: __pochi_widget_fade_in 1200ms ease-out both;
  animation-delay: var(--pochi-widget-appear-delay, 0ms);
}
svg .__pochi_widget_appear {
  animation: __pochi_widget_svg_fade_in 1200ms ease-out both;
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


/* Dark palette */
:where(.dark svg .blue > rect, .dark svg .blue > circle, .dark svg .blue > ellipse) { fill: #0C447C; stroke: #85B7EB; }
:where(.dark svg .blue > .th, .dark svg .blue > .t) { fill: #B5D4F4; }
:where(.dark svg .blue > .ts) { fill: #85B7EB; }
:where(.dark svg .teal > rect, .dark svg .teal > circle, .dark svg .teal > ellipse) { fill: #085041; stroke: #5DCAA5; }
:where(.dark svg .teal > .th, .dark svg .teal > .t) { fill: #9FE1CB; }
:where(.dark svg .teal > .ts) { fill: #5DCAA5; }
:where(.dark svg .amber > rect, .dark svg .amber > circle, .dark svg .amber > ellipse) { fill: #633806; stroke: #EF9F27; }
:where(.dark svg .amber > .th, .dark svg .amber > .t) { fill: #FAC775; }
:where(.dark svg .amber > .ts) { fill: #EF9F27; }
:where(.dark svg .green > rect, .dark svg .green > circle, .dark svg .green > ellipse) { fill: #27500A; stroke: #97C459; }
:where(.dark svg .green > .th, .dark svg .green > .t) { fill: #C0DD97; }
:where(.dark svg .green > .ts) { fill: #97C459; }
:where(.dark svg .red > rect, .dark svg .red > circle, .dark svg .red > ellipse) { fill: #791F1F; stroke: #F09595; }
:where(.dark svg .red > .th, .dark svg .red > .t) { fill: #F7C1C1; }
:where(.dark svg .red > .ts) { fill: #F09595; }
:where(.dark svg .purple > rect, .dark svg .purple > circle, .dark svg .purple > ellipse) { fill: #3C3489; stroke: #AFA9EC; }
:where(.dark svg .purple > .th, .dark svg .purple > .t) { fill: #CECBF6; }
:where(.dark svg .purple > .ts) { fill: #AFA9EC; }
:where(.dark svg .coral > rect, .dark svg .coral > circle, .dark svg .coral > ellipse) { fill: #712B13; stroke: #F0997B; }
:where(.dark svg .coral > .th, .dark svg .coral > .t) { fill: #F5C4B3; }
:where(.dark svg .coral > .ts) { fill: #F0997B; }
:where(.dark svg .pink > rect, .dark svg .pink > circle, .dark svg .pink > ellipse) { fill: #72243E; stroke: #ED93B1; }
:where(.dark svg .pink > .th, .dark svg .pink > .t) { fill: #F4C0D1; }
:where(.dark svg .pink > .ts) { fill: #ED93B1; }
:where(.dark svg .gray > rect, .dark svg .gray > circle, .dark svg .gray > ellipse) { fill: #444441; stroke: #B4B2A9; }
:where(.dark svg .gray > .th, .dark svg .gray > .t) { fill: #D3D1C7; }
:where(.dark svg .gray > .ts) { fill: #B4B2A9; }

/* Light palette */
:where(.light svg .blue > rect, .light svg .blue > circle, .light svg .blue > ellipse) { fill: #DBE7F4; stroke: #2B6CB0; }
:where(.light svg .blue > .th, .light svg .blue > .t) { fill: #1B4480; }
:where(.light svg .blue > .ts) { fill: #2B6CB0; }
:where(.light svg .teal > rect, .light svg .teal > circle, .light svg .teal > ellipse) { fill: #D2EEDF; stroke: #0E8C6F; }
:where(.light svg .teal > .th, .light svg .teal > .t) { fill: #084F3F; }
:where(.light svg .teal > .ts) { fill: #0E8C6F; }
:where(.light svg .amber > rect, .light svg .amber > circle, .light svg .amber > ellipse) { fill: #FBE6C2; stroke: #B47213; }
:where(.light svg .amber > .th, .light svg .amber > .t) { fill: #5C3704; }
:where(.light svg .amber > .ts) { fill: #B47213; }
:where(.light svg .green > rect, .light svg .green > circle, .light svg .green > ellipse) { fill: #DDEFC7; stroke: #5E8A35; }
:where(.light svg .green > .th, .light svg .green > .t) { fill: #294E0A; }
:where(.light svg .green > .ts) { fill: #5E8A35; }
:where(.light svg .red > rect, .light svg .red > circle, .light svg .red > ellipse) { fill: #F7D7D7; stroke: #BF3535; }
:where(.light svg .red > .th, .light svg .red > .t) { fill: #791F1F; }
:where(.light svg .red > .ts) { fill: #BF3535; }
:where(.light svg .purple > rect, .light svg .purple > circle, .light svg .purple > ellipse) { fill: #E0DCF5; stroke: #5E4FBE; }
:where(.light svg .purple > .th, .light svg .purple > .t) { fill: #393188; }
:where(.light svg .purple > .ts) { fill: #5E4FBE; }
:where(.light svg .coral > rect, .light svg .coral > circle, .light svg .coral > ellipse) { fill: #F8DDCF; stroke: #C25530; }
:where(.light svg .coral > .th, .light svg .coral > .t) { fill: #6F2A12; }
:where(.light svg .coral > .ts) { fill: #C25530; }
:where(.light svg .pink > rect, .light svg .pink > circle, .light svg .pink > ellipse) { fill: #F8D8E2; stroke: #BD3F6D; }
:where(.light svg .pink > .th, .light svg .pink > .t) { fill: #71243D; }
:where(.light svg .pink > .ts) { fill: #BD3F6D; }
:where(.light svg .gray > rect, .light svg .gray > circle, .light svg .gray > ellipse) { fill: #E5E3DD; stroke: #6F6E69; }
:where(.light svg .gray > .th, .light svg .gray > .t) { fill: #404040; }
:where(.light svg .gray > .ts) { fill: #6F6E69; }
`;
