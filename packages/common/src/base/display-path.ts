const builtInAssetPatterns = [
  /(?:^|\/)\.vscode(?:-[^/]+)?\/extensions\/[^/]+\/assets\/(skills|agents)\/(.+)$/i,
  /(?:^|\/)packages\/vscode\/assets\/(skills|agents)\/(.+)$/i,
  /(?:^|\/)pochi-builtin-[^/]+\/(skills|agents)\/(.+)$/i,
];
const builtInAssetDisplayNames = {
  skills: "skills",
  agents: "agents",
} as const;
const projectStorageDisplayNames = {
  memory: "projectMemory",
  transcripts: "projectTranscripts",
} as const;
const projectStoragePattern =
  /(?:^|\/)\.pochi\/projects\/[^/]+\/(memory|transcripts)(?:\/(.*))?$/i;

export interface PochiBuiltinFileDisplayInfo {
  assetKind: "skills" | "agents";
  relativePath: string;
  isReference: boolean;
}

export function getPochiBuiltinFileDisplayInfo(
  path: string,
): PochiBuiltinFileDisplayInfo | undefined {
  const normalizedPath = path.replace(/\\/g, "/");
  const match = builtInAssetPatterns
    .map((pattern) => normalizedPath.match(pattern))
    .find((match) => match !== null);
  if (!match) {
    return undefined;
  }

  const [, assetKind, relativePath] = match;
  return {
    assetKind: assetKind as "skills" | "agents",
    relativePath,
    isReference: relativePath.split("/")[1] === "references",
  };
}

export function formatPochiFileDisplayPath(path: string) {
  const info = getPochiBuiltinFileDisplayInfo(path);
  if (info) {
    return `${builtInAssetDisplayNames[info.assetKind]}/${info.relativePath}`;
  }

  return formatPochiProjectStorageDisplayPath(path) ?? path;
}

function formatPochiProjectStorageDisplayPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const match = normalizedPath.match(projectStoragePattern);
  if (!match) {
    return undefined;
  }

  const [, storageKind, relativePath] = match;
  const displayName =
    projectStorageDisplayNames[
      storageKind as keyof typeof projectStorageDisplayNames
    ];
  return relativePath ? `${displayName}/${relativePath}` : displayName;
}
