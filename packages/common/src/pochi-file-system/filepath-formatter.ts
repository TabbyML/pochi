const builtInAssetPatterns = [
  /(?:^|\/)\.vscode(?:-[^/]+)?\/extensions\/[^/]+\/assets\/(skills|agents)\/(.+)$/i,
  /(?:^|\/)packages\/vscode\/assets\/(skills|agents)\/(.+)$/i,
  /(?:^|\/)pochi-builtin-[^/]+\/(skills|agents)\/(.+)$/i,
];
const projectStoragePattern =
  /^projects\/[^/]+\/(memory|transcripts)(?:\/(.*))?$/i;
const taskStoragePattern = /^tasks\/[^/]+\/([^/]+)(?:\/(.*))?$/i;
const virtualStoragePattern = /^pochi:\/\/([~$])\/([^/]+)(?:\/(.*))?$/i;

export interface PochiFileDisplayPathOptions {
  homeDir?: string;
}

export function formatPochiFileDisplayPath(
  path: string,
  options?: PochiFileDisplayPathOptions,
) {
  return (
    formatPochiBuiltInFileDisplayPath(path) ??
    formatPochiVirtualStorageDisplayPath(path) ??
    formatPochiProjectStorageDisplayPath(path, options?.homeDir) ??
    formatPochiTaskStorageDisplayPath(path, options?.homeDir) ??
    formatPochiHomeStorageDisplayPath(path, options?.homeDir) ??
    path
  );
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function formatPochiBuiltInFileDisplayPath(path: string) {
  const normalizedPath = normalizePath(path);
  for (const pattern of builtInAssetPatterns) {
    const match = normalizedPath.match(pattern);
    if (match) return `pochi://${match[1]}/${match[2]}`;
  }
  return undefined;
}

function formatPochiVirtualStorageDisplayPath(path: string) {
  const normalizedPath = normalizePath(path);
  const match = normalizedPath.match(virtualStoragePattern);
  if (!match) {
    return undefined;
  }

  return normalizedPath;
}

function formatPochiProjectStorageDisplayPath(
  path: string,
  homeDir: string | undefined,
) {
  const homeRelativePath = getPochiHomeStorageRelativePath(path, homeDir);
  const match = homeRelativePath?.match(projectStoragePattern);
  if (!match) {
    return undefined;
  }

  const [, storageKind, filePath] = match;
  return filePath
    ? `pochi://$/${storageKind}/${filePath}`
    : `pochi://$/${storageKind}`;
}

function formatPochiTaskStorageDisplayPath(
  path: string,
  homeDir: string | undefined,
) {
  const homeRelativePath = getPochiHomeStorageRelativePath(path, homeDir);
  const match = homeRelativePath?.match(taskStoragePattern);
  if (!match) {
    return undefined;
  }

  const [, storageKind, filePath] = match;
  return filePath
    ? `pochi://~/${storageKind}/${filePath}`
    : `pochi://~/${storageKind}`;
}

function formatPochiHomeStorageDisplayPath(
  path: string,
  homeDir: string | undefined,
) {
  const relativePath = getPochiHomeStorageRelativePath(path, homeDir);
  if (relativePath === undefined) return undefined;
  return relativePath ? `pochi://${relativePath}` : "pochi://";
}

function getPochiHomeStorageRelativePath(
  path: string,
  homeDir: string | undefined,
) {
  const normalizedPath = normalizePath(path);
  const bases = ["~/.pochi", homeDir && `${normalizePath(homeDir)}/.pochi`];

  for (const base of bases) {
    if (!base) continue;
    const relativePath = stripPathPrefix(normalizedPath, base);
    if (relativePath !== undefined) return relativePath;
  }

  return undefined;
}

function stripPathPrefix(path: string, prefix: string) {
  if (path === prefix) return "";
  if (!path.startsWith(`${prefix}/`)) return undefined;
  return path.slice(prefix.length + 1);
}
