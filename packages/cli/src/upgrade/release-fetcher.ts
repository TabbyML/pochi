const GITHUB_REPO = "TabbyML/pochi";

export interface GitHubRelease {
  tag_name: string;
  assets: {
    name: string;
    browser_download_url: string;
  }[];
}

// Filter releases to only include CLI releases (exclude vscode releases)
export function filterCliReleases(releases: GitHubRelease[]): GitHubRelease[] {
  return releases.filter((release) => {
    const tag = release.tag_name.toLowerCase();
    return (
      tag.includes("pochi-cli@") ||
      (tag.includes("cli@") && !tag.includes("vscode"))
    );
  });
}

// Fetch the latest CLI release from GitHub
export async function fetchLatestCliRelease(): Promise<GitHubRelease> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch releases: ${response.statusText}`);
  }

  const releases = (await response.json()) as GitHubRelease[];
  const cliReleases = filterCliReleases(releases);

  if (cliReleases.length === 0) {
    throw new Error("No CLI releases found");
  }

  return cliReleases[0]; // First release is the latest
}
