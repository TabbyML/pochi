// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWidgetIframeDocument,
  buildWidgetIframeSrc,
  ChartJsCdnScriptSrc,
  coalescePendingWidgetMessage,
  collectWidgetRevealElements,
  collectWidgetThemeVariables,
  extractWidgetScripts,
  getCurrentWidgetThemeClass,
  isAllowedWidgetExternalScriptSrc,
  measureWidgetContentHeight,
  normalizeWidgetModuleScriptSrc,
  prepareWidgetHtml,
  sanitizeWidgetFragment,
  selectWidgetRevealElements,
  shouldAnimateWidgetReveal,
  stripRunnableScripts,
  WidgetThemeStyleId,
} from "../utils";

describe("render widget utilities", () => {
  afterEach(() => {
    document.documentElement.classList.remove("vscode-dark", "vscode-light");
    document.documentElement.style.cssText = "";
    document.body.classList.remove("vscode-dark", "vscode-light");
    document.body.style.cssText = "";
  });

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
    body.style.paddingTop = "4px";
    body.style.paddingBottom = "4px";
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 900,
    });
    root.getBoundingClientRect = () =>
      ({
        height: 180,
      }) as DOMRect;

    expect(measureWidgetContentHeight(root, body)).toBe(188);
  });

  it("allows an empty widget root to measure as zero before content renders", () => {
    const root = document.createElement("div");
    const body = document.createElement("body");
    root.getBoundingClientRect = () =>
      ({
        height: 0,
      }) as DOMRect;

    expect(measureWidgetContentHeight(root, body)).toBe(0);
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
    expect(iframeDocument).toContain("450ms ease-out");
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

  it("can inline the packaged renderer script with the parent webview nonce", () => {
    const scriptSrc =
      "https://file+.vscode-resource.vscode-cdn.net/Users/me/.vscode/extensions/tabbyml.pochi/assets/webview-ui/dist/renderer-entry.js";
    const iframeDocument = buildWidgetIframeDocument({
      src: scriptSrc,
      code: 'console.log("</script>")',
      nonce: "abc123",
    });

    expect(iframeDocument).toContain(
      `script-src 'nonce-abc123' ${ChartJsCdnScriptSrc} 'unsafe-eval'`,
    );
    expect(iframeDocument).toContain(
      '<script nonce="abc123">console.log("<\\/script>")</script>',
    );
    expect(iframeDocument).not.toContain(`src="${scriptSrc}"`);
    expect(iframeDocument).not.toContain("script-src https://file+");
    expect(iframeDocument).not.toContain("data:text/javascript");
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

  it("collects theme variables defined on body (real VSCode webview)", () => {
    document.body.style.setProperty("--vscode-font-family", "MyFont, sans");
    document.body.style.setProperty(
      "--vscode-editor-foreground",
      "#abcdef",
    );

    const themeCss = collectWidgetThemeVariables();
    expect(themeCss).toContain("--vscode-font-family: MyFont, sans;");
    expect(themeCss).toContain("--vscode-editor-foreground: #abcdef;");
  });

  it("prefers body-scoped variables over duplicates on documentElement", () => {
    document.body.style.setProperty(
      "--vscode-editor-foreground",
      "#bodywin",
    );
    document.documentElement.style.setProperty(
      "--vscode-editor-foreground",
      "#htmlloses",
    );

    const themeCss = collectWidgetThemeVariables();
    expect(themeCss).toContain("--vscode-editor-foreground: #bodywin;");
    expect(themeCss).not.toContain("#htmlloses");
  });

  it("detects current theme class from body and documentElement", () => {
    expect(getCurrentWidgetThemeClass()).toBe("dark");

    document.documentElement.classList.add("vscode-light");
    expect(getCurrentWidgetThemeClass()).toBe("light");
    document.documentElement.classList.remove("vscode-light");

    document.body.classList.add("vscode-light");
    expect(getCurrentWidgetThemeClass()).toBe("light");
    document.body.classList.remove("vscode-light");

    document.body.classList.add("vscode-dark");
    expect(getCurrentWidgetThemeClass()).toBe("dark");
  });

  it("writes the theme class on iframe <html> and isolates theme css in a dedicated <style>", () => {
    const themeCss = ":root {\n  --vscode-editor-foreground: #fff;\n}";
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
      themeCss,
      "pochi-widget",
      "light",
    );

    expect(iframeDocument).toContain('<html class="light">');
    expect(iframeDocument).toContain(
      `<style id="${WidgetThemeStyleId}">\n${themeCss}\n</style>`,
    );
    expect(iframeDocument).toContain(".light svg .blue");
    expect(iframeDocument).toContain(".dark svg .blue");
  });

  it("uses canonical diagram palette stops through shared SVG color rules", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
    );
    const palette = {
      blue: {
        50: "#E6F1FB",
        100: "#B5D4F4",
        200: "#85B7EB",
        600: "#185FA5",
        800: "#0C447C",
      },
      teal: {
        50: "#E1F5EE",
        100: "#9FE1CB",
        200: "#5DCAA5",
        600: "#0F6E56",
        800: "#085041",
      },
      amber: {
        50: "#FAEEDA",
        100: "#FAC775",
        200: "#EF9F27",
        600: "#854F0B",
        800: "#633806",
      },
      green: {
        50: "#EAF3DE",
        100: "#C0DD97",
        200: "#97C459",
        600: "#3B6D11",
        800: "#27500A",
      },
      red: {
        50: "#FCEBEB",
        100: "#F7C1C1",
        200: "#F09595",
        600: "#A32D2D",
        800: "#791F1F",
      },
      purple: {
        50: "#EEEDFE",
        100: "#CECBF6",
        200: "#AFA9EC",
        600: "#534AB7",
        800: "#3C3489",
      },
      coral: {
        50: "#FAECE7",
        100: "#F5C4B3",
        200: "#F0997B",
        600: "#993C1D",
        800: "#712B13",
      },
      pink: {
        50: "#FBEAF0",
        100: "#F4C0D1",
        200: "#ED93B1",
        600: "#993556",
        800: "#72243E",
      },
      gray: {
        50: "#F1EFE8",
        100: "#D3D1C7",
        200: "#B4B2A9",
        600: "#5F5E5A",
        800: "#444441",
      },
    } as const;
    const colorSelector = Object.keys(palette)
      .map((name) => `svg .${name}`)
      .join(", ");

    for (const [name, stops] of Object.entries(palette)) {
      expect(iframeDocument).toContain(
        `.dark svg .${name} { --pochi-svg-fill: ${stops[800]}; --pochi-svg-stroke: ${stops[200]}; --pochi-svg-title: ${stops[100]}; --pochi-svg-subtitle: ${stops[200]}; }`,
      );
      expect(iframeDocument).toContain(
        `.light svg .${name} { --pochi-svg-fill: ${stops[50]}; --pochi-svg-stroke: ${stops[600]}; --pochi-svg-title: ${stops[800]}; --pochi-svg-subtitle: ${stops[600]}; }`,
      );
    }
    expect(iframeDocument).toContain(
      `:where(${colorSelector}) > :where(rect, circle, ellipse) { fill: var(--pochi-svg-fill); stroke: var(--pochi-svg-stroke); }`,
    );
    expect(iframeDocument).toContain(
      `:where(${colorSelector}) > :where(.th, .t) { fill: var(--pochi-svg-title); }`,
    );
    expect(iframeDocument).toContain(
      `:where(${colorSelector}) > .ts { fill: var(--pochi-svg-subtitle); }`,
    );
    expect(iframeDocument).not.toContain(".light svg .blue > rect");
    expect(iframeDocument).not.toContain(".dark svg .blue > rect");
  });

  it("defaults to the dark class when none is provided", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
    );
    expect(iframeDocument).toContain('<html class="dark">');
  });

  it("ships both light and dark color-scheme rules so html class swap is enough", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
    );
    expect(iframeDocument).toContain(".light body { color-scheme: light; }");
    expect(iframeDocument).toContain(".dark body { color-scheme: dark; }");
  });

  it("starts the iframe body compact with no root minimum height", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
    );

    expect(iframeDocument).toContain("padding: 4px 0;");
    expect(iframeDocument).toContain("min-height: 0;");
    expect(iframeDocument).not.toContain("padding: 12px 0;");
    expect(iframeDocument).not.toContain("min-height: 96px;");
  });

  it("does not leak `vscode-` prefixed selectors into the iframe stylesheet", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
    );
    expect(iframeDocument).not.toContain(".vscode-dark svg");
    expect(iframeDocument).not.toContain(".vscode-light svg");
  });

  it("prefers body over documentElement when both have theme classes", () => {
    document.documentElement.classList.add("vscode-dark");
    document.body.classList.add("vscode-light");

    expect(getCurrentWidgetThemeClass()).toBe("light");
  });

  it("strips `javascript:` and absolute network href attributes from links", () => {
    expect(
      sanitizeWidgetFragment(
        `<a href="javascript:alert(1)">x</a><a href="https://evil.test">y</a><a href="#anchor">z</a>`,
      ),
    ).toBe(`<a>x</a><a>y</a><a href="#anchor">z</a>`);
  });

  it("removes every forbidden top-level tag from rendered fragments", () => {
    const html = `
      <base href="https://attacker.test">
      <embed src="x">
      <form><input/></form>
      <iframe src="x"></iframe>
      <link rel="stylesheet" href="x">
      <meta http-equiv="refresh" content="0;url=x">
      <object data="x"></object>
      <span>ok</span>
    `;
    const sanitized = sanitizeWidgetFragment(html);
    for (const tag of ["base", "embed", "form", "iframe", "link", "meta", "object"]) {
      expect(sanitized).not.toContain(`<${tag}`);
    }
    expect(sanitized).toContain("<span>ok</span>");
  });

  it("HTML-escapes the channel id so attacker-controlled toolCallId cannot break out", () => {
    const iframeDocument = buildWidgetIframeDocument(
      "http://localhost:4112/widget.js",
      "",
      `pochi-widget-"><script>x</script>`,
    );
    // The `"` and `<` are escaped so the attribute cannot terminate early.
    // `>` is harmless inside a double-quoted attribute value.
    expect(iframeDocument).not.toContain(`-"><script`);
    expect(iframeDocument).toContain("&quot;");
    expect(iframeDocument).toContain("&lt;script>");
    expect(iframeDocument).toContain("&lt;/script>");
  });

  it("only accepts the exact Chart.js CDN URL as an external script", () => {
    expect(isAllowedWidgetExternalScriptSrc(ChartJsCdnScriptSrc)).toBe(true);
    expect(
      isAllowedWidgetExternalScriptSrc(
        "http://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
      ),
    ).toBe(false);
    expect(
      isAllowedWidgetExternalScriptSrc(
        "https://cdn.jsdelivr.net/npm/chart.js@5.0.0/dist/chart.umd.min.js",
      ),
    ).toBe(false);
    expect(
      isAllowedWidgetExternalScriptSrc(
        "https://evil.test/npm/chart.js@4.5.1/dist/chart.umd.min.js",
      ),
    ).toBe(false);
    expect(isAllowedWidgetExternalScriptSrc("not a url")).toBe(false);
  });

  it("strips Vite's worker_file query but preserves other query params", () => {
    expect(
      normalizeWidgetModuleScriptSrc(
        "http://localhost:4112/x.ts?worker_file&type=module",
      ),
    ).toBe("http://localhost:4112/x.ts");
    expect(
      normalizeWidgetModuleScriptSrc("http://localhost:4112/x.ts?v=1"),
    ).toBe("http://localhost:4112/x.ts?v=1");
  });

  it("coalesces same-mode same-html messages but replaces on content change", () => {
    const a = {
      type: "preview" as const,
      html: "<div>a</div>",
      animateReveal: false,
    };
    const b = {
      type: "preview" as const,
      html: "<div>b</div>",
      animateReveal: false,
    };
    const same = {
      type: "preview" as const,
      html: "<div>a</div>",
      animateReveal: false,
    };

    expect(coalescePendingWidgetMessage(a, same)).toBe(a);
    expect(coalescePendingWidgetMessage(a, b)).toBe(b);
    expect(coalescePendingWidgetMessage(undefined, a)).toBe(a);
  });
});
