export function hasNewTaskResult(result: unknown): boolean {
  if (typeof result === "string") {
    return result.trim().length > 0;
  }
  return result !== undefined && result !== null;
}
