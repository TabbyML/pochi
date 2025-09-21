import type { CodexCredentials } from "./types";

let cachedCredentials: CodexCredentials | undefined;

export function getCodexCredentials(): CodexCredentials | undefined {
  return cachedCredentials;
}

export function updateCodexCredentials(
  update: Partial<CodexCredentials>,
): void {
  cachedCredentials = cachedCredentials
    ? { ...cachedCredentials, ...update }
    : (update as CodexCredentials);
}

export function clearCodexCredentials(): void {
  cachedCredentials = undefined;
}