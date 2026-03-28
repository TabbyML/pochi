import { describe, expect, it } from "vitest";
import {
  isCrossOriginWorkerUrl,
  makeSharedWorkerBootstrapUrl,
  makeWorkerBootstrapSource,
} from "../worker-url";

describe("makeWorkerBootstrapSource", () => {
  it("creates a module bootstrap import", () => {
    expect(
      makeWorkerBootstrapSource(
        "https://example.com/shared-worker.js",
        "module",
      ),
    ).toBe('import "https://example.com/shared-worker.js"');
  });

  it("creates a classic bootstrap importScripts wrapper", () => {
    expect(
      makeWorkerBootstrapSource(
        "https://example.com/shared-worker.js",
        undefined,
      ),
    ).toContain('importScripts("https://example.com/shared-worker.js")');
  });
});

describe("makeSharedWorkerBootstrapUrl", () => {
  it("returns a deterministic data URL", () => {
    const first = makeSharedWorkerBootstrapUrl(
      "https://example.com/shared-worker.js",
      "module",
    );
    const second = makeSharedWorkerBootstrapUrl(
      "https://example.com/shared-worker.js",
      "module",
    );

    expect(first).toBe(second);
    expect(first).toContain("data:text/javascript;charset=utf-8,");
    expect(decodeURIComponent(first.split(",")[1] ?? "")).toBe(
      'import "https://example.com/shared-worker.js"',
    );
  });
});

describe("isCrossOriginWorkerUrl", () => {
  it("treats data URLs as local", () => {
    expect(
      isCrossOriginWorkerUrl("data:text/javascript;charset=utf-8,test"),
    ).toBe(false);
  });
});
