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
  name: string;
  filePath: string;
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
  const [name = "", ...filePathParts] = relativePath.split("/");
  const filePath = filePathParts.join("/");
  return {
    assetKind: assetKind as "skills" | "agents",
    name,
    filePath,
    relativePath,
    isReference:
      filePath === "references" || filePath.startsWith("references/"),
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
