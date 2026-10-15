import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptsDir = fileURLToPath(
  new URL("../base/agents/browser/scripts/", import.meta.url),
);
const temporaryDirectories: string[] = [];
const oldBinary = "#!/bin/sh\necho 'agent-browser 0.27.3-pochi'\n";
const currentBinary = "#!/bin/sh\necho 'agent-browser 0.39.0'\n";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createFixture(windows = false) {
  const root = await mkdtemp(path.join(tmpdir(), "pochi-browser-install-"));
  temporaryDirectories.push(root);
  const userHome = path.join(root, "User Home");
  const installDir = path.join(userHome, ".pochi/bin");
  const commandsDir = path.join(root, "commands");
  await mkdir(installDir, { recursive: true });
  await mkdir(commandsDir);
  const binary = path.join(
    installDir,
    windows ? "agent-browser.exe" : "agent-browser",
  );
  const payload = path.join(root, "payload");
  const downloadLog = path.join(root, "download-url");
  await writeFile(binary, oldBinary, { mode: 0o755 });
  await writeFile(payload, currentBinary, { mode: 0o755 });
  await writeFile(
    path.join(commandsDir, "uname"),
    '#!/bin/sh\ncase "$1" in -s) echo "$BROWSER_TEST_SYSTEM";; -m) echo "$BROWSER_TEST_ARCH";; esac\n',
    { mode: 0o755 },
  );
  await writeFile(
    path.join(commandsDir, "ldd"),
    '#!/bin/sh\necho "$BROWSER_TEST_LIBC" >&2\nexit 1\n',
    { mode: 0o755 },
  );
  await writeFile(
    path.join(commandsDir, "curl"),
    `#!/bin/sh
set -eu
printf '%s' "$2" > "$BROWSER_TEST_DOWNLOAD_LOG"
cp "$BROWSER_TEST_PAYLOAD" "$4"
exit "$BROWSER_TEST_DOWNLOAD_EXIT"
`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    HOME: userHome,
    USERPROFILE: userHome,
    PATH: `${commandsDir}${path.delimiter}${process.env.PATH}`,
    BROWSER_TEST_SYSTEM: "Darwin",
    BROWSER_TEST_ARCH: "arm64",
    BROWSER_TEST_LIBC: "glibc",
    BROWSER_TEST_PAYLOAD: payload,
    BROWSER_TEST_DOWNLOAD_LOG: downloadLog,
    BROWSER_TEST_DOWNLOAD_EXIT: "0",
  };
  return { root, binary, payload, downloadLog, installDir, env };
}

function runBash(env: NodeJS.ProcessEnv) {
  return spawnSync("bash", [path.join(scriptsDir, "install.sh")], {
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe.skipIf(process.platform === "win32")("browser Bash installer", () => {
  it.each([
    ["Darwin", "arm64", "", "darwin-arm64"],
    ["Darwin", "x86_64", "", "darwin-x64"],
    ["Linux", "aarch64", "glibc", "linux-arm64"],
    ["Linux", "x86_64", "glibc", "linux-x64"],
    ["Linux", "arm64", "musl libc", "linux-musl-arm64"],
    ["Linux", "x86_64", "musl libc", "linux-musl-x64"],
  ])("installs the %s %s %s asset", async (system, arch, libc, asset) => {
    const fixture = await createFixture();
    const result = runBash({
      ...fixture.env,
      BROWSER_TEST_SYSTEM: system,
      BROWSER_TEST_ARCH: arch,
      BROWSER_TEST_LIBC: libc,
    });
    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(fixture.downloadLog, "utf8")).resolves.toBe(
      `https://github.com/vercel-labs/agent-browser/releases/download/v0.39.0/agent-browser-${asset}`,
    );
    await expect(readFile(fixture.binary, "utf8")).resolves.toBe(currentBinary);
    expect(
      spawnSync(fixture.binary, ["--version"], {
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe("agent-browser 0.39.0");
    await expect(readdir(fixture.installDir)).resolves.toEqual([
      "agent-browser",
    ]);
  });

  it("skips downloading when the required version is installed", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.binary, currentBinary);
    const result = runBash(fixture.env);
    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(fixture.downloadLog)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["download", "version", "execution"])(
    "preserves the old binary and removes temporary files on %s failure",
    async (failure) => {
      const fixture = await createFixture();
      if (failure === "version") {
        await writeFile(
          fixture.payload,
          "#!/bin/sh\necho 'agent-browser 0.40.0'\n",
        );
      } else if (failure === "execution") {
        await writeFile(fixture.payload, `${currentBinary}exit 1\n`);
      }
      const result = runBash({
        ...fixture.env,
        BROWSER_TEST_DOWNLOAD_EXIT: failure === "download" ? "22" : "0",
      });
      expect(result.status).toBe(failure === "download" ? 22 : 1);
      await expect(readFile(fixture.binary, "utf8")).resolves.toBe(oldBinary);
      await expect(readdir(fixture.installDir)).resolves.toEqual([
        "agent-browser",
      ]);
    },
  );

  it.each([
    ["FreeBSD", "x86_64"],
    ["Linux", "riscv64"],
  ])("rejects unsupported %s %s without downloading", async (system, arch) => {
    const fixture = await createFixture();
    const result = runBash({
      ...fixture.env,
      BROWSER_TEST_SYSTEM: system,
      BROWSER_TEST_ARCH: arch,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported");
    await expect(readFile(fixture.downloadLog)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(fixture.binary, "utf8")).resolves.toBe(oldBinary);
  });
});

// On POSIX hosts, executable shell fixtures stand in for the downloaded Windows
// binary so PowerShell can exercise the installer without network access.
const powershell = process.env.POCHI_TEST_POWERSHELL || "pwsh";
const canRunPowerShell =
  process.platform !== "win32" &&
  spawnSync(powershell, ["-NoProfile", "-Command", "exit 0"], {
    timeout: 10_000,
  }).status === 0;

async function runPowerShell(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  env: NodeJS.ProcessEnv = {},
) {
  const wrapper = path.join(fixture.root, "run-installer.ps1");
  await writeFile(
    wrapper,
    `
param([string]$Installer)
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
  [IO.File]::WriteAllText($env:BROWSER_TEST_DOWNLOAD_LOG, $Uri)
  Copy-Item -LiteralPath $env:BROWSER_TEST_PAYLOAD -Destination $OutFile
  if ($env:BROWSER_TEST_DOWNLOAD_EXIT -ne "0") { throw "Download failed" }
}
& $Installer
exit $LASTEXITCODE
`,
  );
  return spawnSync(
    powershell,
    ["-NoProfile", "-File", wrapper, path.join(scriptsDir, "install.ps1")],
    {
      env: {
        ...fixture.env,
        PROCESSOR_ARCHITECTURE: "AMD64",
        PROCESSOR_ARCHITEW6432: "",
        ...env,
      },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

describe.skipIf(!canRunPowerShell)("browser PowerShell installer", () => {
  it.each([
    ["AMD64", ""],
    ["ARM64", ""],
    ["x86", "AMD64"],
  ])(
    "installs the x64 asset for %s (native: %s)",
    async (architecture, nativeArchitecture) => {
      const fixture = await createFixture(true);
      const result = await runPowerShell(fixture, {
        PROCESSOR_ARCHITECTURE: architecture,
        PROCESSOR_ARCHITEW6432: nativeArchitecture,
      });
      expect(result.status, result.stderr).toBe(0);
      await expect(readFile(fixture.downloadLog, "utf8")).resolves.toBe(
        "https://github.com/vercel-labs/agent-browser/releases/download/v0.39.0/agent-browser-win32-x64.exe",
      );
      await expect(readFile(fixture.binary, "utf8")).resolves.toBe(
        currentBinary,
      );
      await expect(readdir(fixture.installDir)).resolves.toEqual([
        "agent-browser.exe",
      ]);
    },
  );

  it("skips downloading when the required version is installed", async () => {
    const fixture = await createFixture(true);
    await writeFile(fixture.binary, currentBinary);
    const result = await runPowerShell(fixture);
    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(fixture.downloadLog)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["download", "version", "execution"])(
    "preserves the old binary and removes temporary files on %s failure",
    async (failure) => {
      const fixture = await createFixture(true);
      if (failure === "version") {
        await writeFile(
          fixture.payload,
          "#!/bin/sh\necho 'agent-browser 0.40.0'\n",
        );
      } else if (failure === "execution") {
        await writeFile(fixture.payload, `${currentBinary}exit 1\n`);
      }
      const result = await runPowerShell(fixture, {
        BROWSER_TEST_DOWNLOAD_EXIT: failure === "download" ? "22" : "0",
      });
      expect(result.status).toBe(1);
      await expect(readFile(fixture.binary, "utf8")).resolves.toBe(oldBinary);
      await expect(readdir(fixture.installDir)).resolves.toEqual([
        "agent-browser.exe",
      ]);
    },
  );

  it("rejects unsupported architectures without downloading", async () => {
    const fixture = await createFixture(true);
    const result = await runPowerShell(fixture, {
      PROCESSOR_ARCHITECTURE: "x86",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported architecture");
    await expect(readFile(fixture.downloadLog)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(fixture.binary, "utf8")).resolves.toBe(oldBinary);
  });
});
