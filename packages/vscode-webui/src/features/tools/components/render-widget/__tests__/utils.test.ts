// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildWidgetIframeDocument,
  buildWidgetIframeSrc,
  ChartJsCdnScriptSrc,
  coalescePendingWidgetMessage,
  collectWidgetRevealElements,
  collectWidgetThemeVariables,
  extractWidgetScripts,
  measureWidgetContentHeight,
  prepareWidgetHtml,
  sanitizeWidgetFragment,
  selectWidgetRevealElements,
  shouldAnimateWidgetReveal,
  stripRunnableScripts,
} from "../utils";

describe("render widget utilities", () => {
  it("strips an unclosed script while previewing streamed HTML", () => {
    const html = `<div>Ready</div><script>document.body.textContent = "nope"`;

    expect(prepareWidgetHtml(html, "preview")).toBe("<div>Ready</div>");
  });

  it("removes scripts, inline event handlers, and forbidden tags in preview", () => {
    const html = `<div onclick="x()">Safe</div><iframe src="x"></iframe><script>alert(1)</script>`;

    expect(prepareWidgetHtml(html, "preview")).toBe("<div>Safe</div>");
  });

  it("keeps visual HTML stable when extracting runnable scripts", () => {
    const html = `<style>.x{color:red}</style><div class="x">Chart</div><script>window.ran = true</script>`;

    expect(stripRunnableScripts(html)).toBe(
      `<style>.x{color:red}</style><div class="x">Chart</div>`,
    );
    expect(extractWidgetScripts(html)).toEqual([
      { type: "inline", code: "window.ran = true" },
    ]);
  });

  it("allows only the approved Chart.js CDN script in final widget HTML", () => {
    const html = [
      `<canvas id="chart"></canvas>`,
      `<script src="${ChartJsCdnScriptSrc}"></script>`,
      `<script src="https://example.test/evil.js"></script>`,
      `<script src="https://cdn.jsdelivr.net/npm/not-chart@1/index.js"></script>`,
      `<script>window.ready = true</script>`,
    ].join("");

    expect(prepareWidgetHtml(html, "finalize")).toBe(
      `<canvas id="chart"></canvas><script src="${ChartJsCdnScriptSrc}"></script><script>window.ready = true</script>`,
    );
    expect(extractWidgetScripts(html)).toEqual([
      { type: "external", src: ChartJsCdnScriptSrc },
      { type: "inline", code: "window.ready = true" },
    ]);
  });

  it("only animates widget reveal while the current chat is active", () => {
    expect(
      shouldAnimateWidgetReveal({
        isExecuting: true,
        isLoading: false,
        isLastPart: false,
      }),
    ).toBe(true);
    expect(
      shouldAnimateWidgetReveal({
        isExecuting: false,
        isLoading: true,
        isLastPart: true,
      }),
    ).toBe(true);
    expect(
      shouldAnimateWidgetReveal({
        isExecuting: false,
        isLoading: true,
        isLastPart: false,
      }),
    ).toBe(false);
    expect(
      shouldAnimateWidgetReveal({
        isExecuting: false,
        isLoading: false,
        isLastPart: true,
      }),
    ).toBe(false);
  });

  it("keeps only the latest pending widget render message", () => {
    const first = {
      type: "preview" as const,
      html: "<div>first</div>",
      animateReveal: true,
    };
    const duplicate = {
      type: "preview" as const,
      html: "<div>first</div>",
      animateReveal: true,
    };
    const latest = {
      type: "finalize" as const,
      html: "<div>latest</div>",
      animateReveal: false,
    };

    expect(coalescePendingWidgetMessage(first, duplicate)).toBe(first);
    expect(coalescePendingWidgetMessage(first, latest)).toBe(latest);
  });

  it("preserves pending reveal animation for the same render payload", () => {
    const animated = {
      type: "finalize" as const,
      html: "<div>same</div>",
      animateReveal: true,
    };
    const notAnimated = {
      type: "finalize" as const,
      html: "<div>same</div>",
      animateReveal: false,
    };

    expect(coalescePendingWidgetMessage(animated, notAnimated)).toBe(animated);
    expect(coalescePendingWidgetMessage(notAnimated, animated)).toBe(animated);
  });

  it("reveals nested SVG elements in DOM order without semantic grouping", () => {
    const template = document.createElement("template");
    template.innerHTML = `
      <svg>
        <defs><marker id="arrow"><path id="marker-path" /></marker></defs>
        <g id="a"><rect id="a-rect" /><text id="a-label">A</text></g>
        <path id="a-to-b" />
        <g id="b"><rect id="b-rect" /></g>
      </svg>
    `;

    const elements = Array.from(template.content.querySelectorAll("*"));
    const revealIds = selectWidgetRevealElements(elements).map(
      (element) => element.id || element.tagName.toLowerCase(),
    );

    expect(revealIds).toEqual([
      "svg",
      "a",
      "a-rect",
      "a-label",
      "a-to-b",
      "b",
      "b-rect",
    ]);
  });

  it("expands added wrapper nodes in HTML string order", () => {
    const template = document.createElement("template");
    template.innerHTML = `
      <div id="wrapper">
        <svg>
          <g id="a" class="node"><rect id="a-rect" /></g>
          <path id="a-to-b" />
          <g id="b" class="node"><rect id="b-rect" /></g>
        </svg>
        <div id="details">Details</div>
      </div>
    `;

    const wrapper = template.content.querySelector("#wrapper");
    expect(wrapper).toBeTruthy();

    const revealIds = collectWidgetRevealElements([wrapper as Element]).map(
      (element) => element.id || element.tagName.toLowerCase(),
    );

    expect(revealIds).toEqual([
      "wrapper",
      "svg",
      "a",
      "a-rect",
      "a-to-b",
      "b",
      "b-rect",
      "details",
    ]);
  });

  it("reveals ordinary HTML descendants in DOM order too", () => {
    const template = document.createElement("template");
    template.innerHTML = `<div id="card"><span id="child">Child</span></div>`;

    const elements = Array.from(template.content.querySelectorAll("*"));

    expect(
      selectWidgetRevealElements(elements).map((element) => element.id),
    ).toEqual(["card", "child"]);
  });

  it("measures widget height from root content instead of viewport scroll height", () => {
    const root = document.createElement("div");
    const body = document.createElement("body");
    body.style.paddingTop = "12px";
    body.style.paddingBottom = "12px";
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 900,
    });
    root.getBoundingClientRect = () =>
      ({
        height: 180,
      }) as DOMRect;

    expect(measureWidgetContentHeight(root, body)).toBe(204);
  });

  it("builds a renderer document with restrictive CSP and disabled network APIs", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/src/features/tools/components/render-widget/renderer-entry.ts",
      "",
      "widget-test-channel",
    );
    const iframeSrc = buildWidgetIframeSrc(iframeDocument);

    expect(iframeDocument).toContain("connect-src http://localhost:4112");
    expect(iframeDocument).toContain(
      `script-src http://localhost:4112 ${ChartJsCdnScriptSrc} 'unsafe-eval'`,
    );
    expect(iframeDocument).toContain("sandboxed");
    expect(iframeDocument).toContain('data-channel-id="widget-test-channel"');
    expect(iframeDocument).not.toContain("data-chart-script-src");
    expect(iframeDocument).toContain(":where(svg .th)");
    expect(iframeDocument).toContain("svg .__pochi_widget_appear");
    expect(iframeDocument).toContain("--pochi-widget-appear-delay");
    expect(iframeDocument).toContain("translateY(8px)");
    expect(iframeDocument).toContain("1200ms ease-out");
    expect(iframeDocument).toContain(
      '<script type="module" src="http://localhost:4112/src/features/tools/components/render-widget/renderer-entry.ts"></script>',
    );
    expect(iframeDocument).not.toContain("<script>\n");
    expect(iframeSrc).toMatch(/^data:text\/html;charset=utf-8,/);
  });

  it("resolves and normalizes a relative renderer script against document base URI", () => {
    const base = document.createElement("base");
    base.href = "http://localhost:4112/";
    document.head.appendChild(base);

    const iframeDocument = buildWidgetIframeDocument(
      "/src/features/tools/components/render-widget/renderer-entry.ts?worker_file&type=module",
    );

    expect(iframeDocument).toContain(
      `script-src http://localhost:4112 ${ChartJsCdnScriptSrc} 'unsafe-eval'`,
    );
    expect(iframeDocument).toContain(
      'src="http://localhost:4112/src/features/tools/components/render-widget/renderer-entry.ts"',
    );
    expect(iframeDocument).not.toContain("data-chart-script-src");
    expect(iframeDocument).not.toContain("worker_file");

    base.remove();
  });

  it("does not inject a local chart capability script in production", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "https://example.test/widget-renderer.js",
    );

    expect(iframeDocument).not.toContain("data-chart-script-src");
    expect(iframeDocument).toContain(
      `script-src https://example.test ${ChartJsCdnScriptSrc} 'unsafe-eval'`,
    );
    expect(iframeDocument).toContain("connect-src https://cdn.jsdelivr.net");
  });

  it("uses one shared sanitizer policy for widget fragments", () => {
    expect(
      sanitizeWidgetFragment(
        `<div onclick="x()" data-ok="yes">Safe</div><a href="https://example.test">link</a><iframe src="x"></iframe>`,
      ),
    ).toBe(`<div data-ok="yes">Safe</div><a>link</a>`);
  });

  it("copies VSCode theme variables into the iframe document", () => {
    document.documentElement.style.setProperty(
      "--vscode-editor-foreground",
      "#ffffff",
    );

    const themeCss = collectWidgetThemeVariables();
    expect(themeCss).toContain("--vscode-editor-foreground: #ffffff;");
    expect(
      buildWidgetIframeDocument("http://localhost:4112/widget.js", themeCss),
    ).toContain("--vscode-editor-foreground: #ffffff;");
  });
});
