export function validateTaskFilePath(
  filePath: string,
): "/plan.md" | `/browser-session/${string}.mp4` {
  if (
    filePath === "/plan.md" ||
    /^\/browser-session\/.*\.mp4$/.test(filePath)
  ) {
    return filePath as "/plan.md" | `/browser-session/${string}.mp4`;
  }
  throw new Error(
    `Only /plan.md and /browser-session/*.mp4 are supported for task file system, got: ${filePath}`,
  );
}
