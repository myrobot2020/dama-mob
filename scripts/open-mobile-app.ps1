param(
  [string]$Url = "http://localhost:8080/?mobile=1",
  [ValidateSet("chrome", "edge")]
  [string]$Browser = "chrome",
  [ValidateSet("pixel5", "iphone12", "custom")]
  [string]$Device = "pixel5",
  [int]$Width = 393,
  [int]$Height = 851,
  [double]$Dpr = 2.75,
  [switch]$CloseExisting,
  [switch]$UseDeviceScaleFactor
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

function Resolve-EdgePath {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Get-DevicePreset([string]$d) {
  switch ($d) {
    # For a small desktop app window, keep scale factor at 1 so the UI isn't zoomed-in.
    # True device DPR emulation is available via -UseDeviceScaleFactor (which will make the viewport much smaller).
    "pixel5" { return @{ W = 393; H = 851; Dpr = 1.0 } }
    "iphone12" { return @{ W = 390; H = 844; Dpr = 1.0 } }
    default { return @{ W = $Width; H = $Height; Dpr = $Dpr } }
  }
}

$exe = $null
if ($Browser -eq "edge") {
  $exe = Resolve-EdgePath
  if (-not $exe) { throw "Edge not found at a standard path." }
} else {
  $exe = Resolve-ChromePath
  if (-not $exe) { throw "Chrome not found at a standard path." }
}

$preset = Get-DevicePreset $Device
$w = [int]$preset.W
$h = [int]$preset.H
$dpr = [double]$preset.Dpr

# By default, close older app windows for the same URL so we don't stack duplicates.
if (-not $PSBoundParameters.ContainsKey("CloseExisting")) {
  $CloseExisting = $true
}

if ($CloseExisting) {
  $procName = if ($Browser -eq "edge") { "msedge.exe" } else { "chrome.exe" }
  $needle = "--app=$Url"
  try {
    Get-CimInstance Win32_Process -Filter "Name='$procName'" |
      Where-Object { $_.CommandLine -and $_.CommandLine -like "*$needle*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch {
    # If we cannot query process command lines, fall back to not closing.
  }
}

# Launch as a minimal app window (no tabs/omnibox), sized like a phone.
$args = @(
  "--app=$Url",
  "--window-size=$w,$h",
  "--window-position=0,0",
  "--disable-features=TranslateUI"
)

if ($UseDeviceScaleFactor) {
  $args += "--force-device-scale-factor=$dpr"
}

Start-Process -FilePath $exe -ArgumentList $args | Out-Null
$scale = 1
if ($UseDeviceScaleFactor) { $scale = $dpr }
Write-Output "Opened app window: $Url ($Browser / $Device ${w}x${h} scale=$scale)"
