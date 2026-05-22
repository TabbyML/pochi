import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("webview CSP", () => {
  it("allows sandboxed widget iframes to load from blob URLs", () => {
    const source = readFileSync(
      "packages/vscode/src/integrations/webview/base.ts",
      "utf8",
    );

    expect(source.match(/frame-src 'self' data: blob:/g)).toHaveLength(2);
  });

  it("allows packaged widget renderer scripts and the approved Chart.js CDN without unsafe-inline", () => {
    const source = readFileSync(
      "packages/vscode/src/integrations/webview/base.ts",
      "utf8",
    );

    expect(source).toContain(
      "`script-src 'nonce-${nonce}' ${webview.cspSource} ${chartJsCdnOrigin} 'unsafe-eval'`",
    );
    expect(source).toContain(
      "`script-src 'nonce-${nonce}' ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlLocalhostDot} ${devWebUIHttpBaseUrlIp} ${chartJsCdnOrigin} '${reactRefreshHash}' 'unsafe-eval'`",
    );
    expect(source.match(/https:\/\/cdn\.jsdelivr\.net/g)).toHaveLength(2);
    expect(source).not.toContain("script-src 'unsafe-inline'");
  });
});
