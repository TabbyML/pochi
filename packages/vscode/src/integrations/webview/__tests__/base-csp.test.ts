import * as assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "mocha";
import * as path from "node:path";

describe("webview CSP", () => {
  it("allows sandboxed widget iframes to load from blob URLs", () => {
    const source = readFileSync(
      path.join(__dirname, "../base.ts"),
      "utf8",
    );

    const matches = source.match(/frame-src 'self' data: blob:/g);
    assert.strictEqual(matches?.length, 2);
  });

  it("allows packaged widget renderer scripts and the approved Chart.js CDN without unsafe-inline", () => {
    const source = readFileSync(
      path.join(__dirname, "../base.ts"),
      "utf8",
    );

    assert.ok(
      source.includes(
        "`script-src 'nonce-${nonce}' ${webview.cspSource} ${chartJsCdnOrigin} 'unsafe-eval'`",
      ),
    );
    assert.ok(
      source.includes(
        "`script-src 'nonce-${nonce}' ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlLocalhostDot} ${devWebUIHttpBaseUrlIp} ${chartJsCdnOrigin} '${reactRefreshHash}' 'unsafe-eval'`",
      ),
    );
    const matches = source.match(/https:\/\/cdn\.jsdelivr\.net/g);
    assert.strictEqual(matches?.length, 2);
    assert.ok(!source.includes("script-src 'unsafe-inline'"));
  });

  it("resolves packaged webview assets through VS Code resource URIs", () => {
    const source = readFileSync(
      path.join(__dirname, "../base.ts"),
      "utf8",
    );
    const copyScript = readFileSync(
      path.join(__dirname, "../../../../scripts/copy-assets.js"),
      "utf8",
    );

    assert.ok(source.includes('return "${webviewDistBaseUri}/" + path;'));
    assert.ok(copyScript.includes('"renderer-entry.js"'));
  });
});
