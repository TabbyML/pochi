import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path, { join } from "node:path";
import * as diff from "diff";
import * as vscode from "vscode";

import { getLogger } from "./logger";

const fsLogger = getLogger("fs");

/**
 * Ensure a directory exists by creating it if needed
 */
export async function ensureFileDirectoryExists(
  fileUri: vscode.Uri,
): Promise<void> {
  const dirUri = vscode.Uri.joinPath(fileUri, "..");
  await vscode.workspace.fs.createDirectory(dirUri);
}

export async function isFileExists(fileUri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(fileUri);
    return true;
  } catch {
    return false;
  }
}

export function createPrettyPatch(
  filename = "file",
  oldStr?: string,
  newStr?: string,
) {
  const patch = diff.createPatch(filename, oldStr || "", newStr || "");
  return patch;
}

/**
 * Generic file reader with error handling
 */
export async function readFileContent(
  filePath: string,
): Promise<string | null> {
  try {
    const fileUri = vscode.Uri.file(filePath);
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(fileContent).toString("utf8");
  } catch (error) {
    return null;
  }
}

/**
 * Resolve the ripgrep binary shipped with VS Code.
 *
 * VS Code 1.124 (June 2026) replaced the single-binary `@vscode/ripgrep`
 * package with the multi-arch `@vscode/ripgrep-universal` package, which lays
 * binaries out under `bin/<platform>-<arch>/rg[.exe]`. Older VS Code builds
 * still ship `@vscode/ripgrep/bin/rg`. We probe the new layout first, fall
 * back to the legacy layout, and finally fall back to the system `rg` on
 * `PATH` so `searchFiles` keeps working even if VS Code reshuffles things
 * again.
 *
 * VS Code also bundles its own code inside an asar archive, so native
 * binaries such as ripgrep are extracted alongside it under
 * `node_modules.asar.unpacked` rather than plain `node_modules`. We probe
 * both directory names for every layout.
 */
function resolveVscodeRipgrepPath(): string {
  const exe = process.platform === "win32" ? "rg.exe" : "rg";
  const archDir = `${process.platform}-${process.arch}`;

  const nodeModuleDirs = ["node_modules.asar.unpacked", "node_modules"];

  const candidates = nodeModuleDirs.flatMap((nodeModules) => [
    // VS Code >= 1.124: @vscode/ripgrep-universal, per-arch subdir.
    join(
      vscode.env.appRoot,
      nodeModules,
      "@vscode",
      "ripgrep-universal",
      "bin",
      archDir,
      exe,
    ),
    // VS Code < 1.124: legacy @vscode/ripgrep single-binary layout.
    join(vscode.env.appRoot, nodeModules, "@vscode", "ripgrep", "bin", exe),
  ]);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Last resort: pick up `rg` from PATH. This keeps `searchFiles` working when
  // VS Code reorganizes its bundled ripgrep again.
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const resolved = execSync(`${which} rg`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)[0]
      ?.trim();
    if (resolved && existsSync(resolved)) {
      fsLogger.warn(
        `Bundled VS Code ripgrep not found at any known path, falling back to system rg: ${resolved}`,
      );
      return resolved;
    }
  } catch {
    // ignore — fall through to legacy default
  }

  fsLogger.warn(
    `Unable to resolve ripgrep binary; returning legacy path. Tried: ${candidates.join(", ")}`,
  );
  return candidates[candidates.length - 1];
}

export const vscodeRipgrepPath = resolveVscodeRipgrepPath();

export const asRelativePath = (
  uri: vscode.Uri | string,
  cwd: string,
): string => {
  if (typeof uri === "string") {
    return path.relative(cwd, uri);
  }
  return path.relative(cwd, uri.fsPath);
};

/**
 * Get the modification time of a file via vscode.workspace.fs.
 * Returns Math.floor(mtime) or undefined if the file doesn't exist.
 *
 */
export async function getVscodeFileMtime(
  resolvedPath: string,
): Promise<number | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath));
    return Math.floor(stat.mtime);
  } catch {
    return undefined;
  }
}
