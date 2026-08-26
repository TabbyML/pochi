// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildStandaloneWidgetHtml } from "../standalone-html";
import { ChartJsCdnScriptSrc, WidgetThemeStyleId } from "../utils";

function getNonce(html: string) {
  const match = html.match(/nonce="([^"]+)"/);
  if (!match) throw new Error("no nonce found in standalone document");
  return match[1];
}

/**
 * Mounts the exported `#root` markup into the jsdom document and runs the
 * inlined runtime script, i.e. what a browser does when the file is opened.
 */
function evaluateStandaloneRuntime(html: string) {
  const exported = new DOMParser().parseFromString(html, "text/html");
  const root = exported.getElementById("root");
  const runtimeCode = exported.querySelector("script[nonce]")?.textContent;
  if (!root || !runtimeCode) {
    throw new Error("standalone document is missing #root or runtime script");
  }

  document.body.replaceChildren(document.importNode(root, true));
  new Function(runtimeCode)();
  return { window };
}

describe("buildStandaloneWidgetHtml", () => {
  it("emits a complete document carrying the theme class and escaped title", () => {
    const html = buildStandaloneWidgetHtml({
      title: 'Sales <b>"2024"</b>',
      widgetCode: "<div>hi</div>",
      themeClass: "light",
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html class="light">');
    expect(html).toContain("<title>Sales &lt;b>&quot;2024&quot;&lt;/b></title>");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("sanitizes the widget markup into #root", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: `<div onclick="steal()">Safe</div><iframe src="x"></iframe>`,
    });

    expect(html).toContain('<div id="root"><div>Safe</div></div>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<iframe");
  });

  it("bakes the state snapshot into the top level pochi-widget element", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<pochi-widget><span>x</span></pochi-widget>",
      state: { count: 3, label: 'a"b' },
    });

    expect(html).toContain(
      '<pochi-widget state="{&quot;count&quot;:3,&quot;label&quot;:&quot;a\\&quot;b&quot;}">',
    );
  });

  it("keeps markup unchanged when there is no top level pochi-widget", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<section>static</section>",
      state: { count: 3 },
    });

    expect(html).toContain('<div id="root"><section>static</section></div>');
    expect(html).not.toContain("<pochi-widget");
  });

  it("defines the pochi-widget custom element in the runtime script", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<pochi-widget></pochi-widget>",
    });

    expect(html).toContain('customElements.define("pochi-widget"');
    expect(html).toContain("pochi-state-change");
  });

  it("installs the window.pochi state api in the runtime script", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<pochi-widget></pochi-widget>",
    });

    expect(html).toContain("window.pochi = {");
    expect(html).toContain("setState: function (nextState)");
  });

  it("exposes the baked state through window.pochi and persists updates", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<pochi-widget><span>x</span></pochi-widget>",
      state: { count: 3 },
    });

    const { window: standaloneWindow } = evaluateStandaloneRuntime(html);

    expect(standaloneWindow.pochi.state).toEqual({ count: 3 });
    standaloneWindow.pochi.setState({ count: 4 });
    expect(standaloneWindow.pochi.state).toEqual({ count: 4 });
  });

  it("re-emits inline widget scripts in order, after the runtime script", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode:
        "<div></div><script>first();</script><script>second();</script>",
    });

    const runtimeIndex = html.indexOf('customElements.define("pochi-widget"');
    const firstIndex = html.indexOf("first();");
    const secondIndex = html.indexOf("second();");

    expect(runtimeIndex).toBeGreaterThan(-1);
    expect(runtimeIndex).toBeLessThan(firstIndex);
    expect(firstIndex).toBeLessThan(secondIndex);
    // Inline widget code keeps `new Function` style scoping.
    expect(html).toContain("(function(){\nfirst();\n})();");
  });

  it("escapes html comment openers inside inline widget code", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: `<script>const s = "<!--";</script>`,
    });

    expect(html).toContain('const s = "<\\!--"');
  });

  it("keeps the allowed Chart.js CDN script and drops other external scripts", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: `<script src="${ChartJsCdnScriptSrc}"></script><script src="https://evil.example.com/x.js"></script>`,
    });

    expect(html).toContain(`<script src="${ChartJsCdnScriptSrc}"></script>`);
    expect(html).not.toContain("evil.example.com");
  });

  it("locks down the document with a nonce based CSP that still allows Chart.js", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<script>run();</script>",
    });
    const nonce = getNonce(html);

    expect(html).toContain(
      `script-src 'nonce-${nonce}' ${ChartJsCdnScriptSrc} 'unsafe-eval'`,
    );
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src https://cdn.jsdelivr.net");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
  });

  it("inlines the captured theme variables", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<div></div>",
      themeVariablesCss: ":root {\n  --vscode-editor-foreground: #fff;\n}",
    });

    expect(html).toContain(`<style id="${WidgetThemeStyleId}">`);
    expect(html).toContain("--vscode-editor-foreground: #fff;");
  });

  it("overrides the embedded widget styles so the standalone page scrolls and is opaque", () => {
    const html = buildStandaloneWidgetHtml({
      title: "w",
      widgetCode: "<div></div>",
    });

    // WidgetBaseStyles is reused as-is...
    expect(html).toContain("body {\n  margin: 0;");
    // ...but standalone pages must not clip content or be transparent.
    const overridesIndex = html.indexOf("/* standalone overrides */");
    expect(overridesIndex).toBeGreaterThan(html.indexOf("body {\n  margin: 0;"));
    expect(html.slice(overridesIndex)).toContain("overflow: auto");
    expect(html.slice(overridesIndex)).toContain(
      "background: var(--vscode-editor-background, #1e1e1e) !important",
    );
  });
});
