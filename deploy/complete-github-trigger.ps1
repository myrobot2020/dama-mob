# Run AFTER GitHub OAuth + Cloud Build GitHub App install for connection `dama-github`.
# Regional GitHub triggers require an explicit service account (org policy / default SA).
$ErrorActionPreference = "Stop"

gcloud config set project damalight | Out-Null
gcloud config set builds/region us-central1 | Out-Null

$projNum = gcloud projects describe damalight --format="value(projectNumber)"
# User-managed SA required for regional triggers + manual runs (Cloud Build SA alone is rejected).
$cbSa = "projects/damalight/serviceAccounts/${projNum}-compute@developer.gserviceaccount.com"
$triggerName = "main-push"

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
$null = gcloud builds repositories describe $name --connection=dama-github --region=us-central1 --format="value(name)" 2>$null
if ($LASTEXITCODE -eq 0) { $repoExists = $true }
if (-not $repoExists) {
  gcloud builds repositories create $name --connection=dama-github --region=us-central1 `
    --remote-uri=$uri --quiet
}

$repoResource = "projects/damalight/locations/us-central1/connections/dama-github/repositories/$name"

$null = gcloud builds triggers describe $triggerName --region=us-central1 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud builds triggers create github `
    --name=$triggerName `
    --repository=$repoResource `
    --branch-pattern="^main$" `
    --build-config="cloudbuild.yaml" `
    --region=us-central1 `
    --service-account=$cbSa `
    --quiet
}

Write-Host "Done. Trigger:"
gcloud builds triggers describe $triggerName --region=us-central1 --format="yaml(name,repositoryEventConfig,filename)"
