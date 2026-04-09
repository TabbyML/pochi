import { homedir } from "node:os";
import path from "node:path";

export function getTaskDataDir(taskId: string): string {
  return path.join(homedir(), ".pochi", "tasks", taskId);
}
