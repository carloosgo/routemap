param(
  [string]$Project = 'atlasmap-dev',
  [string]$KeepDashboardId = '8d6a1c24-ea96-4bc3-848d-442a40b2adef',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este cleanup esta bloqueado deliberadamente a atlasmap-dev.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

function Invoke-GcloudJson {
  param([string[]]$Arguments)
  $raw = & gcloud @Arguments --format=json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud fallo: $($raw -join [Environment]::NewLine)"
  }
  $text = ($raw -join [Environment]::NewLine).Trim()
  if (-not $text) { return @() }
  return @($text | ConvertFrom-Json)
}

function DashboardId {
  param($Dashboard)
  return (([string]$Dashboard.name -split '/')[-1])
}

function Is-AtlasDevDashboard {
  param($Dashboard)
  return (
    [string]$Dashboard.labels.system -eq 'atlas-storage-v4' -and
    [string]$Dashboard.labels.environment -eq 'dev'
  )
}

function Normalize-DashboardForComparison {
  param($Dashboard)
  $copy = $Dashboard | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  foreach ($property in @('name', 'etag', 'displayName')) {
    if ($copy.PSObject.Properties.Name -contains $property) {
      $copy.PSObject.Properties.Remove($property)
    }
  }
  return ($copy | ConvertTo-Json -Depth 100 -Compress)
}

$dashboards = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project"))
$atlasDashboards = @($dashboards | Where-Object { Is-AtlasDevDashboard $_ })
$keepMatches = @($atlasDashboards | Where-Object { (DashboardId $_) -eq $KeepDashboardId })
$duplicateCandidates = @($atlasDashboards | Where-Object { (DashboardId $_) -ne $KeepDashboardId })

$plan = [ordered]@{
  project = $Project
  applyRequested = [bool]$Apply
  keepDashboardId = $KeepDashboardId
  atlasDashboardCount = $atlasDashboards.Count
  duplicateCandidateCount = $duplicateCandidates.Count
  duplicateCandidateIds = @($duplicateCandidates | ForEach-Object { DashboardId $_ })
  deletesExactlyOneDashboard = $Apply
  deletesAlertPolicies = $false
  deletesLogMetrics = $false
  mutatesBudgets = $false
  enablesStorageV4Write = $false
  touchesProduction = $false
}
$plan | ConvertTo-Json -Depth 6

if (-not $Apply) {
  Write-Output 'Dry-run: no se elimino ningun dashboard.'
  exit 0
}

if ($keepMatches.Count -ne 1) {
  throw 'No se encontro exactamente un dashboard canonico con el ID esperado; cleanup abortado.'
}
if ($atlasDashboards.Count -ne 2 -or $duplicateCandidates.Count -ne 1) {
  throw 'El cleanup solo opera cuando existen exactamente dos dashboards Atlas dev y un unico duplicado.'
}

$duplicateId = DashboardId $duplicateCandidates[0]
$keepDetails = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'describe', $KeepDashboardId, "--project=$Project")) | Select-Object -First 1
$duplicateDetails = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'describe', $duplicateId, "--project=$Project")) | Select-Object -First 1

if (-not (Is-AtlasDevDashboard $keepDetails) -or -not (Is-AtlasDevDashboard $duplicateDetails)) {
  throw 'Los dashboards ya no cumplen los labels Atlas dev esperados; cleanup abortado.'
}

$keepNormalized = Normalize-DashboardForComparison $keepDetails
$duplicateNormalized = Normalize-DashboardForComparison $duplicateDetails
if ($keepNormalized -ne $duplicateNormalized) {
  throw 'Los dos dashboards no son equivalentes despues de normalizar campos server-owned; no se elimina ninguno.'
}

& gcloud monitoring dashboards delete $duplicateId "--project=$Project" --quiet
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo eliminar el dashboard duplicado $duplicateId."
}

$remaining = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project"))
$remainingAtlas = @($remaining | Where-Object { Is-AtlasDevDashboard $_ })
if ($remainingAtlas.Count -ne 1 -or (DashboardId $remainingAtlas[0]) -ne $KeepDashboardId) {
  throw 'Post-check invalido: no quedo exactamente el dashboard canonico esperado.'
}

[ordered]@{
  project = $Project
  applied = $true
  keptDashboardId = $KeepDashboardId
  deletedDashboardId = $duplicateId
  remainingAtlasDashboardCount = $remainingAtlas.Count
  alertPoliciesUntouched = $true
  logMetricsUntouched = $true
  budgetsUntouched = $true
  storageV4WriteUnchanged = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 6
