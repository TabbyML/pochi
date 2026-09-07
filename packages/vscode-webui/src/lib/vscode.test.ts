// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("@quilted/threads", () => ({
  ThreadNestedWindow: class {
    imports: Record<string, ReturnType<typeof vi.fn>>;

    constructor(_window: Window, options: { imports: string[] }) {
      this.imports = Object.fromEntries(
        options.imports.map((name) => [name, vi.fn()]),
      );
    }
  },
}));

Object.defineProperty(globalThis, "acquireVsCodeApi", {
  configurable: true,
  value: vi.fn(() => ({})),
});

describe("vscodeHost", () => {
  it("exposes pasted-text persistence to the webview", async () => {
    const { vscodeHost } = await import("./vscode");

    expect(vscodeHost.persistPastedTextFiles).toBeTypeOf("function");
  });
});
