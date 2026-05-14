param(
  [string]$Url = "http://10.0.2.2:8080/?mobile=1",
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$sdk = "$env:LocalAppData\Android\Sdk"
$adb = Join-Path $sdk "platform-tools\adb.exe"

if (-not (Test-Path $adb)) {
  throw "adb.exe not found at $adb (install Android SDK platform-tools)."
}

Write-Output "Waiting for an Android device/emulator (up to $TimeoutSeconds seconds)..."

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  $lines = & $adb devices 2>$null
  $deviceLine = $lines | Where-Object { $_ -match "^\S+\s+device$" } | Select-Object -First 1
  if ($deviceLine) { break }
  Start-Sleep -Milliseconds 500
}

$lines = & $adb devices
$deviceLine = $lines | Where-Object { $_ -match "^\S+\s+device$" } | Select-Object -First 1
if (-not $deviceLine) {
  Write-Output "No device found. Start an emulator in Android Studio → Device Manager, then re-run this script."
  exit 1
}

Write-Output "Opening: $Url"
& $adb shell am start -a android.intent.action.VIEW -d $Url | Out-Null
Write-Output "Sent intent to emulator/device."

