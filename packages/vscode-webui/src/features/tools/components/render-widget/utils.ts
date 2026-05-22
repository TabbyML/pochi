export type WidgetRenderMode = "preview" | "finalize";

export type PendingWidgetRenderMessage = {
  type: string;
  html: string;
  animateReveal?: boolean;
};

export const ChartJsCdnScriptSrc =
  "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";
export const ChartJsCdnOrigin = "https://cdn.jsdelivr.net";

export type WidgetScript =
  | { type: "external"; src: string }
  | { type: "inline"; code: string };

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

export function collectWidgetThemeVariables() {
  const lines: string[] = [];
  const styles = getComputedStyle(document.documentElement);

  for (let i = 0; i < styles.length; i++) {
    const name = styles.item(i);
    if (!name.startsWith("--vscode-") && !name.startsWith("--pochi-")) {
      continue;
    }

    const value = styles.getPropertyValue(name).trim();
    if (value) {
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

export function buildWidgetIframeShell(
  rendererScriptSrc: string,
  themeVariablesCss = "",
  channelId = "pochi-widget",
) {
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
  const scriptCspSource = getScriptCspSource(resolvedRendererScriptSrc);
  const connectCspSource = getWidgetConnectCspSource(resolvedRendererScriptSrc);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${scriptCspSource} ${ChartJsCdnScriptSrc} 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src ${connectCspSource}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; font-src 'none'">
<style>
${safeThemeVariablesCss}
${WidgetBaseStyles}
</style>
</head>
<body>
<div id="root" data-channel-id="${safeChannelId}" aria-label="sandboxed generative UI widget"></div>
<script type="module" src="${safeRendererScriptSrc}"></script>
</body>
</html>`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
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
html { color-scheme: light dark; }
body {
  margin: 0;
  padding: 12px 0;
  overflow: hidden;
  background: transparent;
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
:where(svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse) { fill: #0C447C; stroke: #85B7EB; }
:where(svg .c-blue > .th, svg .c-blue > .t) { fill: #B5D4F4; }
:where(svg .c-blue > .ts) { fill: #85B7EB; }
:where(svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse) { fill: #085041; stroke: #5DCAA5; }
:where(svg .c-teal > .th, svg .c-teal > .t) { fill: #9FE1CB; }
:where(svg .c-teal > .ts) { fill: #5DCAA5; }
:where(svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse) { fill: #633806; stroke: #EF9F27; }
:where(svg .c-amber > .th, svg .c-amber > .t) { fill: #FAC775; }
:where(svg .c-amber > .ts) { fill: #EF9F27; }
:where(svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse) { fill: #27500A; stroke: #97C459; }
:where(svg .c-green > .th, svg .c-green > .t) { fill: #C0DD97; }
:where(svg .c-green > .ts) { fill: #97C459; }
:where(svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse) { fill: #791F1F; stroke: #F09595; }
:where(svg .c-red > .th, svg .c-red > .t) { fill: #F7C1C1; }
:where(svg .c-red > .ts) { fill: #F09595; }
:where(svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse) { fill: #3C3489; stroke: #AFA9EC; }
:where(svg .c-purple > .th, svg .c-purple > .t) { fill: #CECBF6; }
:where(svg .c-purple > .ts) { fill: #AFA9EC; }
:where(svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse) { fill: #712B13; stroke: #F0997B; }
:where(svg .c-coral > .th, svg .c-coral > .t) { fill: #F5C4B3; }
:where(svg .c-coral > .ts) { fill: #F0997B; }
:where(svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse) { fill: #72243E; stroke: #ED93B1; }
:where(svg .c-pink > .th, svg .c-pink > .t) { fill: #F4C0D1; }
:where(svg .c-pink > .ts) { fill: #ED93B1; }
:where(svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse) { fill: #444441; stroke: #B4B2A9; }
:where(svg .c-gray > .th, svg .c-gray > .t) { fill: #D3D1C7; }
:where(svg .c-gray > .ts) { fill: #B4B2A9; }
`;
