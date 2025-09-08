import { homedir } from "node:os";
import * as path from "node:path";

/**
 * Expands path segments with environment variables and home directory
 */
export function expandPathSegments(pathSegments: string[]): string {
  const homeDir = homedir() || process.env.HOME || "";
  const expandedSegments = pathSegments.map((segment) => {
    if (segment === "~") {
      return homeDir;
    }
    if (process.platform === "win32") {
      return segment.replace(/%([^%]+)%/g, (match, varName) => {
        return process.env[varName] || match;
      });
    }
    return segment.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
      return process.env[varName] || match;
    });
  });
  return path.join(...expandedSegments);
}

/**
 * Normalizes a file path by replacing home directory with ~
 */
export function normalizePath(filePath: string): string {
  const homeDir = homedir();
  if (filePath.startsWith(homeDir)) {
    return filePath.replace(homeDir, "~");
  }
  return filePath;
}

/**
 * Expands a path string by replacing ~ with home directory
 */
export function expandPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    const homeDir = homedir() || process.env.HOME || "";
    return path.join(homeDir, filePath.slice(1));
  }
  return filePath;
}
