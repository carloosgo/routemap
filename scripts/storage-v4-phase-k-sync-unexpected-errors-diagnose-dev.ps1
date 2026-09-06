param(
  [string]$Project = 'atlasmap-dev',
  [string]$Freshness = '7d',
  [int]$Limit = 100
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este diagnostico esta bloqueado deliberadamente a atlasmap-dev.'
}
if ($Limit -lt 1 -or $Limit -gt 1000) {
  throw 'Limit debe estar entre 1 y 1000.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

$filter = 'jsonPayload.message="storage_v4_sync_metric" AND jsonPayload.event="flush" AND jsonPayload.outcome="unexpected-error"'
$raw = & gcloud logging read $filter `
  "--project=$Project" `
  "--freshness=$Freshness" `
  "--limit=$Limit" `
  '--order=desc' `
  '--format=json(timestamp,jsonPayload)' 2>&1

if ($LASTEXITCODE -ne 0) {
  throw "gcloud logging read fallo: $($raw -join [Environment]::NewLine)"
}

$text = ($raw -join [Environment]::NewLine).Trim()
$entries = if ($text) { @($text | ConvertFrom-Json) } else { @() }

$safeEntries = @($entries | ForEach-Object {
  $payload = $_.jsonPayload
  [ordered]@{
    timestamp = [string]$_.timestamp
    event = [string]$payload.event
    outcome = [string]$payload.outcome
    reason = if ($null -eq $payload.reason) { $null } else { [string]$payload.reason }
    errorName = if ($null -eq $payload.errorName) { $null } else { [string]$payload.errorName }
    errorCode = if ($null -eq $payload.errorCode) { $null } else { [string]$payload.errorCode }
    durationMs = $payload.durationMs
    pending = $payload.pending
  }
})

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  freshness = $Freshness
  query = 'storage_v4_sync_metric flush unexpected-error'
  unexpectedErrorCountObserved = $safeEntries.Count
  entries = $safeEntries
  fieldsIntentionallyOmitted = @('userId', 'uid', 'tripId', 'entityId', 'entityKey', 'payload', 'errorMessage')
  mutatesCloud = $false
  mutatesApplicationData = $false
  touchesProduction = $false
} | ConvertTo-Json -Depth 8
