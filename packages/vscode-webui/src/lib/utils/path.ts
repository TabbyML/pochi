export function normalizeRelativePath(value: string) {
  return value.replace(/^[./\\]+/, "");
}

export function joinPath(basePath: string, relativePath: string) {
  const separator = basePath.includes("\\") ? "\\" : "/";
  const normalizedBase = basePath.replace(/[\\/]+$/, "");
  const normalizedRelative = relativePath.replace(/^[\\/]+/, "");
  return `${normalizedBase}${separator}${normalizedRelative}`;
}
