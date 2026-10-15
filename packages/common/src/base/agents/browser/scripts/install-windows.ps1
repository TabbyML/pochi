$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$version = "0.39.0"
$installDir = Join-Path $env:USERPROFILE ".pochi/bin"
$binary = Join-Path $installDir "agent-browser.exe"
$download = $null

function Test-AgentBrowserVersion {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    $output = & $Path --version 2>$null
    return $LASTEXITCODE -eq 0 -and "$output".Trim() -eq "agent-browser $version"
  } catch {
    return $false
  }
}

try {
  if (Test-AgentBrowserVersion $binary) {
    Write-Output "agent-browser $version is already installed at $binary"
    exit 0
  }

  $architecture = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }
  if ($architecture -notin @("AMD64", "ARM64")) {
    throw "Unsupported architecture for agent-browser ${version}: $architecture"
  }

  # The official x64 asset also runs on Windows ARM64 through emulation.
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  $download = Join-Path $installDir ("agent-browser.download." + [guid]::NewGuid().ToString("N") + ".exe")
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/vercel-labs/agent-browser/releases/download/v$version/agent-browser-win32-x64.exe" -OutFile $download
  if (-not (Test-AgentBrowserVersion $download)) {
    throw "Downloaded agent-browser failed version verification (expected $version). Existing installation was preserved."
  }
  Move-Item -LiteralPath $download -Destination $binary -Force
  Write-Output "Installed agent-browser $version at $binary"
} catch {
  Write-Error -ErrorAction Continue "Failed to install agent-browser $version at ${binary}: $_"
  exit 1
} finally {
  if ($download -and (Test-Path -LiteralPath $download)) {
    Remove-Item -LiteralPath $download -Force
  }
}
