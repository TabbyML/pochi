export function validateTaskFilePath(filePath: string) {
  if (
    filePath === "/plan.md" ||
    filePath === "/walkthrough.md" ||
    /^\/browser-session\/.*\.mp4$/.test(filePath)
  ) {
    return filePath as
      | "/plan.md"
      | "/walkthrough.md"
      | `/browser-session/${string}.mp4`;
  }
  throw new Error(
    `Only /plan.md, /walkthrough.md, /browser-session/*.mp4 are supported for task file system, got: ${filePath}`,
  );
}
