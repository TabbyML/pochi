param(
  [string]$Topic = "",
  [string]$Base = "HEAD"
)

$ErrorActionPreference = "Stop"
$worktreePath = ""
$branch = ""
$initialized = $false

function Invoke-Git {
  param([string[]]$GitArgs)

  $output = & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed."
  }
  return $output
}

function Write-Result {
  param(
    [bool]$Ok,
    [string]$Root,
    [string]$Branch,
    [string]$Revision,
    [bool]$Initialized,
    [string]$Message
  )

  [ordered]@{
    ok = $Ok
    root = $Root
    branch = $Branch
    base = $Revision
    initialized = $Initialized
    error = $Message
  } | ConvertTo-Json -Compress
}

try {
  $repoRoot = (Invoke-Git -GitArgs @("rev-parse", "--show-toplevel") | Select-Object -First 1).Trim()
  if (-not $repoRoot) {
    throw "The current directory is not inside a Git worktree."
  }
  Set-Location -LiteralPath $repoRoot

  Invoke-Git -GitArgs @("rev-parse", "--verify", "$Base^{commit}") | Out-Null

  $worktreeList = @(Invoke-Git -GitArgs @("-c", "core.quotePath=false", "worktree", "list", "--porcelain"))
  $worktreePaths = @(
    $worktreeList |
      Where-Object { $_ -like "worktree *" } |
      ForEach-Object { $_.Substring(9) }
  )

  if ($worktreePaths.Count -eq 0) {
    throw "Git did not report a main worktree."
  }

  $mainWorktree = $worktreePaths[0]
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $slug = ($Topic.ToLowerInvariant() -replace "[^a-z0-9._-]+", "-").Trim([char[]]@("-", "."))
  $branch = if ($slug) { "worktree/$slug" } else { "worktree/$timestamp" }

  & git check-ref-format --branch $branch *> $null
  if ($LASTEXITCODE -ne 0) {
    $branch = "worktree/$timestamp"
  }

  & git show-ref --verify --quiet "refs/heads/$branch"
  if ($LASTEXITCODE -eq 0) {
    $branch = "$branch-$timestamp"
  }

  $worktreeName = $branch.Replace("/", "-")
  $worktreeParent = if ($worktreePaths.Count -gt 1) {
    Split-Path -Parent $worktreePaths[1]
  } else {
    $trimmedMainWorktree = $mainWorktree.TrimEnd([char[]]@("/", "\"))
    "${trimmedMainWorktree}.worktree"
  }
  $worktreePath = Join-Path $worktreeParent $worktreeName

  New-Item -ItemType Directory -Path $worktreeParent -Force | Out-Null
  Invoke-Git -GitArgs @("worktree", "add", "-b", $branch, $worktreePath, $Base) | Out-Host

  $includeFile = Join-Path $mainWorktree ".worktreeinclude"
  if (Test-Path -LiteralPath $includeFile -PathType Leaf) {
    try {
      $includedFiles = @(Invoke-Git -GitArgs @(
        "-C",
        $mainWorktree,
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-from=$includeFile"
      ))

      foreach ($relativePath in $includedFiles) {
        if (-not $relativePath) {
          continue
        }
        $segments = $relativePath -split "[\\/]"
        if ([IO.Path]::IsPathRooted($relativePath) -or $segments -contains "..") {
          Write-Warning "Skipping unsafe .worktreeinclude path: $relativePath"
          continue
        }

        $sourcePath = Join-Path $mainWorktree $relativePath
        $destinationPath = Join-Path $worktreePath $relativePath
        try {
          New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
          Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
        } catch {
          Write-Warning "Failed to copy .worktreeinclude file $relativePath`: $($_.Exception.Message)"
        }
      }
    } catch {
      Write-Warning "Failed to list .worktreeinclude files; continuing without them."
    }
  }

  $initScript = Join-Path $worktreePath ".pochi/init.ps1"
  if (Test-Path -LiteralPath $initScript -PathType Leaf) {
    Push-Location -LiteralPath $worktreePath
    try {
      & powershell -ExecutionPolicy Bypass -File ./.pochi/init.ps1
      if ($LASTEXITCODE -ne 0) {
        throw "The worktree init script failed."
      }
    } finally {
      Pop-Location
    }
    $initialized = $true
  }

  Write-Result -Ok $true -Root $worktreePath -Branch $branch -Revision $Base -Initialized $initialized -Message ""
} catch {
  Write-Result -Ok $false -Root $worktreePath -Branch $branch -Revision $Base -Initialized $initialized -Message $_.Exception.Message
  exit 1
}
