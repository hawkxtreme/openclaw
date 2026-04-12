param(
  [string]$VkGroupId,
  [string]$VkGroup,
  [string]$VkGroupToken,
  [string]$DmPolicy
)

$ErrorActionPreference = "Stop"

function Resolve-GitBash {
  $candidates = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files\Git\usr\bin\bash.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $command = Get-Command bash -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Git Bash was not found. Install Git for Windows or add bash.exe to PATH."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bashWrapper = Join-Path $scriptDir "setup-vk-longpoll-local-ollama.sh"

if (-not (Test-Path -LiteralPath $bashWrapper)) {
  throw "Missing wrapper script: $bashWrapper"
}

$bashExe = Resolve-GitBash
$bashArgs = @($bashWrapper)

if ($VkGroupId) {
  $bashArgs += @("--group-id", $VkGroupId)
}

if ($VkGroup) {
  $bashArgs += @("--group", $VkGroup)
}

if ($VkGroupToken) {
  $bashArgs += @("--token", $VkGroupToken)
}

if ($DmPolicy) {
  $bashArgs += @("--dm-policy", $DmPolicy)
}

& $bashExe @bashArgs
exit $LASTEXITCODE
