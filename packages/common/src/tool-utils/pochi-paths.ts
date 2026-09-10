import { homedir } from "node:os";
import path from "node:path";

export function getPochiDataDir(): string {
  return path.join(homedir(), ".pochi");
}

export function getTaskDataDir(taskId: string): string {
  return path.join(getPochiDataDir(), "tasks", taskId);
}
