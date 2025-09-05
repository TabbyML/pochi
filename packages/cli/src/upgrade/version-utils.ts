import * as semver from "semver";

// Compare two versions and return true if the latest is newer
export function isNewerVersion(latest: string, current: string): boolean {
  try {
    // Try to parse as valid semver first (preserves pre-release info)
    const latestValid = semver.valid(latest);
    const currentValid = semver.valid(current);

    if (latestValid && currentValid) {
      // Both are valid semver, use semver comparison
      return semver.gt(latestValid, currentValid);
    }

    // Fallback to coerce if not valid semver (strips pre-release)
    const latestClean = semver.coerce(latest);
    const currentClean = semver.coerce(current);

    if (!latestClean || !currentClean) {
      // Fallback to string comparison if semver parsing fails
      return latest > current;
    }

    // Use semver.gt (greater than) for comparison
    return semver.gt(latestClean, currentClean);
  } catch (error) {
    // Fallback to string comparison if semver fails
    return latest > current;
  }
}

// Parse version string into semver-compatible format
export function parseVersion(version: string): semver.SemVer | null {
  try {
    return semver.coerce(version);
  } catch (error) {
    return null;
  }
}

// Extract version from GitHub release tag
export function extractVersionFromTag(tag: string): string {
  return tag
    .replace(/^pochi-cli@/, "")
    .replace(/^cli@/, "")
    .replace(/^v/, "");
}
