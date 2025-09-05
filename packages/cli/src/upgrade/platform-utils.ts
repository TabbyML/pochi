function getPlatformName(): string {
  const platform = process.platform;

  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "mac";
    case "linux":
      return "linux";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function getArchitecture(): string {
  const arch = process.arch;

  switch (arch) {
    case "x64":
      return "x64";
    case "arm64":
      return "arm64";
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

export function getPlatformBinaryName(): string {
  const platformName = getPlatformName();
  const archName = getArchitecture();
  const extension = process.platform === "win32" ? ".zip" : ".tar.gz";

  return `pochi-${platformName}-${archName}${extension}`;
}

export function getBinaryFileName(version: string): string {
  const extension = process.platform === "win32" ? ".exe" : "";
  return `pochi-${version}${extension}`;
}

export function getLatestBinaryFileName(): string {
  const extension = process.platform === "win32" ? ".exe" : "";
  return `pochi${extension}`;
}
