import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCrossOriginWorkerUrl,
  makeSharedWorkerBootstrapUrl,
  makeWorkerBootstrapBlobUrl,
  makeWorkerBootstrapUrl,
  makeWorkerBootstrapSource,
  revokeWorkerBootstrapBlobUrl,
} from "../worker-url";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectURL,
  });
  vi.restoreAllMocks();
});

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

describe("makeWorkerBootstrapBlobUrl", () => {
  it("returns a same-origin blob URL with a debuggable source URL", () => {
    let blobParts: BlobPart[] | undefined;
    let blobOptions: BlobPropertyBag | undefined;
    const BaseBlob = Blob;
    class TestBlob extends BaseBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        blobParts = parts;
        blobOptions = options;
        super(parts, options);
      }
    }
    const createObjectURL = vi.fn(() => "blob:vscode-webview://panel/worker");
    vi.stubGlobal("Blob", TestBlob);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });

    const url = makeWorkerBootstrapBlobUrl(
      "https://example.com/worker.js",
      "module",
      "webview-1",
    );

    expect(url).toBe("blob:vscode-webview://panel/worker");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(TestBlob));
    expect(blobParts).toEqual([
      'import "https://example.com/worker.js"\n//# sourceURL=vscode-worker?id=webview-1',
    ]);
    expect(blobOptions).toEqual({ type: "text/javascript" });
  });

  it("bypasses VS Code localhost routing for blob worker imports", () => {
    let blobParts: BlobPart[] | undefined;
    const BaseBlob = Blob;
    class TestBlob extends BaseBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        blobParts = parts;
        super(parts, options);
      }
    }
    vi.stubGlobal("Blob", TestBlob);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:vscode-webview://panel/worker"),
    });

    makeWorkerBootstrapBlobUrl(
      "http://localhost:4112/src/livestore.default.worker.ts?worker_file&type=module",
      "module",
      "webview-1",
    );

    expect(blobParts).toEqual([
      'import "http://localhost.:4112/src/livestore.default.worker.ts?worker_file&type=module"\n//# sourceURL=vscode-worker?id=webview-1',
    ]);
  });
});

describe("revokeWorkerBootstrapBlobUrl", () => {
  it("revokes the underlying blob URL without routing search params", () => {
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    revokeWorkerBootstrapBlobUrl("blob:vscode-webview://panel/worker?id=webview-1");

    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:vscode-webview://panel/worker",
    );
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

  it("can carry the VS Code webview id in the data URL search", () => {
    const url = makeWorkerBootstrapUrl(
      "https://example.com/worker.js",
      "module",
      "webview-1",
    );
    const parsed = new URL(url);

    expect(parsed.searchParams.get("id")).toBe("webview-1");
    expect(decodeURIComponent(url.split(",")[1] ?? "")).toBe(
      'import "https://example.com/worker.js"\n//# sourceURL=vscode-worker?id=webview-1',
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
