import { execSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import chalk from "chalk";
import {
  getLatestBinaryFileName,
  getPlatformBinaryName,
} from "./platform-utils";
import type { GitHubRelease } from "./release-fetcher";
import { extractVersionFromTag } from "./version-utils";

export function getPochiDir(): string {
  const pochiDir = join(homedir(), ".pochi");
  const binDir = join(pochiDir, "bin");

  // Ensure directories exist
  if (!existsSync(pochiDir)) {
    mkdirSync(pochiDir, { recursive: true });
  }
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  return binDir;
}

function findExecutableInDirectory(dir: string): string | null {
  // Recursively search for executable files
  function searchRecursively(currentDir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        files.push(...searchRecursively(fullPath));
      } else if (entry.isFile()) {
        const stats = statSync(fullPath);

        // Check if file is executable
        // On Windows, consider .exe files as executable
        // On Unix, check the executable bit
        const isExecutable =
          process.platform === "win32"
            ? extname(entry.name).toLowerCase() === ".exe"
            : (stats.mode & 0o111) !== 0;

        if (
          isExecutable &&
          !entry.name.includes(".tar.gz") &&
          !entry.name.includes(".zip")
        ) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  const executables = searchRecursively(dir);
  return executables.length > 0 ? executables[0] : null;
}

async function extractArchive(
  archivePath: string,
  tempDir: string,
): Promise<string> {
  console.log(`📦 Extracting ${archivePath}...`);

  try {
    if (archivePath.endsWith(".tar.gz")) {
      execSync(`tar -xzf "${archivePath}" -C "${tempDir}"`, {
        stdio: "ignore",
      });
    } else if (archivePath.endsWith(".zip")) {
      // Try different unzip commands for cross-platform compatibility
      try {
        execSync(`unzip -q "${archivePath}" -d "${tempDir}"`, {
          stdio: "ignore",
        });
      } catch (error) {
        // Try PowerShell on Windows if unzip is not available
        if (process.platform === "win32") {
          execSync(
            `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tempDir}'"`,
            { stdio: "ignore" },
          );
        } else {
          throw error;
        }
      }
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }
  } catch (error) {
    throw new Error(`Failed to extract archive: ${error}`);
  }

  // Find the extracted binary using Node.js APIs
  const extractedBinary = findExecutableInDirectory(tempDir);

  if (!extractedBinary) {
    // Get directory contents for error message using Node.js APIs
    const contents = readdirSync(tempDir, { withFileTypes: true })
      .map((entry) => `${entry.isDirectory() ? "d" : "-"} ${entry.name}`)
      .join("\n");

    throw new Error(
      `No executable found in extracted archive. Contents:\n${contents}`,
    );
  }

  return extractedBinary;
}

export async function downloadAndInstall(
  release: GitHubRelease,
): Promise<void> {
  try {
    const binaryName = getPlatformBinaryName();
    // Only look for CLI assets, not VSCode extension assets
    const asset = release.assets.find((asset) => {
      const name = asset.name.toLowerCase();
      return (
        name === binaryName.toLowerCase() &&
        !name.includes("vscode") &&
        !name.includes(".vsix")
      );
    });

    if (!asset) {
      throw new Error(
        `CLI binary not found for your platform: ${binaryName}. Available assets: ${release.assets.map((a) => a.name).join(", ")}`,
      );
    }

    console.log(`⬇️ Downloading ${asset.name}...`);

    // Get version for the binary name
    const version = extractVersionFromTag(release.tag_name);

    const binDir = getPochiDir();
    const latestBinaryName = getLatestBinaryFileName();
    const latestBinaryPath = join(binDir, latestBinaryName);

    console.log(`⚙️ Installing to: ${latestBinaryPath}`);

    // Create temporary directory for extraction
    const tempDir = join(tmpdir(), `pochi-upgrade-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const archivePath = join(tempDir, asset.name);

    // Download the new binary using curl with progress
    console.log("🔄 Downloading with progress...");
    try {
      execSync(
        `curl -L --progress-bar "${asset.browser_download_url}" -o "${archivePath}"`,
        {
          stdio: "inherit",
        },
      );
    } catch (error) {
      throw new Error(`Failed to download: ${error}`);
    }

    // Extract the archive and get the binary path
    const extractedBinaryPath = await extractArchive(archivePath, tempDir);
    console.log(`🔍 Found binary: ${extractedBinaryPath}`);

    // If a previous version exists, remove it.
    if (existsSync(latestBinaryPath)) {
      rmSync(latestBinaryPath);
    }

    // Move the new binary to the final destination
    copyFileSync(extractedBinaryPath, latestBinaryPath);

    // Make executable
    if (process.platform !== "win32") {
      chmodSync(latestBinaryPath, 0o755);
    }

    // Clean up temporary directory
    rmSync(tempDir, { recursive: true, force: true });

    console.log(chalk.green(`✅ Successfully installed Pochi v${version}`));
    console.log(chalk.cyan(`📍 Installed to: ${latestBinaryPath}`));
    console.log();
    console.log(chalk.yellow("To use the new version:"));
    console.log(chalk.white(`  ${latestBinaryPath} --version`));
    console.log();
    console.log(
      chalk.gray(
        "To add to your PATH permanently, add this to your shell profile:",
      ),
    );
    console.log(chalk.white(`  export PATH="${binDir}:$PATH"`));
    console.log();
    console.log(chalk.gray("Or create an alias:"));
    console.log(chalk.white(`  alias pochi="${latestBinaryPath}"`));
  } catch (error) {
    console.error(chalk.red("Failed to install update:"), error);
  }
}
