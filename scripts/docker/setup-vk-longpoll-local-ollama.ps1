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
& $bashExe $bashWrapper
exit $LASTEXITCODE
