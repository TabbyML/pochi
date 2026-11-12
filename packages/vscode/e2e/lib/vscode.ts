import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

/** packages/vscode, loaded with --extensionDevelopmentPath. */
export const extensionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/**
 * Download VS Code (or reuse the cached copy) and return its executable.
 * Version: $VSCODE_VERSION, default "stable". Uses the same cache as
 * `vscode-test` (unit tests), so the download is shared.
 */
export function downloadVSCode(): Promise<string> {
  return downloadAndUnzipVSCode({
    version: process.env.VSCODE_VERSION || "stable",
    cachePath: path.join(extensionPath, ".vscode-test"),
  });
}
