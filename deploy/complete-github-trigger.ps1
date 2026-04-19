# Run AFTER GitHub OAuth + Cloud Build GitHub App install for connection `dama-github`.
$ErrorActionPreference = "Stop"

gcloud config set project damalight | Out-Null
gcloud config set builds/region us-central1 | Out-Null

$stage = gcloud builds connections describe dama-github --region=us-central1 `
  --format="value(installationState.stage)" 2>$null

if (-not $stage -or $stage -ne "COMPLETE") {
  Write-Host "GitHub connection is not COMPLETE yet (stage: $stage)."
  Write-Host "1) OAuth: open the URL from:"
  Write-Host '   gcloud builds connections describe dama-github --region=us-central1 --format="yaml(installationState)"'
  Write-Host "2) Install the Google Cloud Build GitHub App on repo myrobot2020/dama-mob when prompted."
  exit 1
}

$name = "dama-mob"
$uri = "https://github.com/myrobot2020/dama-mob.git"

$repoExists = $false
try {
  $null = gcloud builds repositories describe $name --connection=dama-github --region=us-central1 --format='value(name)' 2>$null
  if ($LASTEXITCODE -eq 0) { $repoExists = $true }
}
catch {}
if (-not $repoExists) {
  gcloud builds repositories create $name --connection=dama-github --region=us-central1 `
    --remote-uri=$uri --quiet
}

$repoResource = "projects/damalight/locations/us-central1/connections/dama-github/repositories/$name"

gcloud builds triggers describe dama-mob-push-main --region=us-central1 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud builds triggers create github `
    --name=dama-mob-push-main `
    --repository=$repoResource `
    --branch-pattern="^main$" `
    --build-config="cloudbuild.yaml" `
    --region=us-central1 `
    --quiet
}

Write-Host "Done. Trigger:"
gcloud builds triggers describe dama-mob-push-main --region=us-central1 --format="yaml(name,github,filename)"
