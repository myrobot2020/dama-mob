param(
  [string]$Url = "http://localhost:8080/?mobile=1",
  [string]$Device = "pixel5"
)

$ErrorActionPreference = "Stop"

function Resolve-ChromePath {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Get-DeviceArgs([string]$d) {
  if ($null -eq $d) { $d = "" }
  $d = $d.Trim().ToLowerInvariant()
  switch ($d) {
    "pixel5" { return @{ W = 393; H = 851; Dpr = 2.75; Ua = "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36" } }
    "iphone12" { return @{ W = 390; H = 844; Dpr = 3.00; Ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" } }
    default { return @{ W = 430; H = 932; Dpr = 2.00; Ua = "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36" } }
  }
}

$chrome = Resolve-ChromePath
if (-not $chrome) {
  throw "Chrome not found. Install Chrome or update scripts/open-mobile-preview.ps1 with your chrome.exe path."
}

$deviceArgs = Get-DeviceArgs $Device
$w = [int]$deviceArgs.W
$h = [int]$deviceArgs.H
$dpr = [double]$deviceArgs.Dpr
$ua = [string]$deviceArgs.Ua

# A "mobile-ish" window with a mobile UA + DPR. Not the DevTools device toolbar, but close enough for UI checks.
$args = @(
  "--new-window",
  "--window-size=$w,$h",
  "--force-device-scale-factor=$dpr",
  "--user-agent=$ua",
  "--disable-features=TranslateUI",
  $Url
)

Start-Process -FilePath $chrome -ArgumentList $args | Out-Null
Write-Output "Opened $Url in Chrome ($Device)"
