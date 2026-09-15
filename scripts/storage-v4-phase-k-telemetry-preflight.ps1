param(
  [string]$Project = 'atlasmap-dev',
  [string]$Freshness = '7d'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$streams = @(
  'storage_v4_rollout_metric',
  'storage_v4_sync_metric',
  'storage_v4_provider_cache_metric',
  'storage_v4_provider_request_metric'
)

$results = foreach ($stream in $streams) {
  $filter = "jsonPayload.message=`"$stream`""
  $raw = & gcloud logging read $filter `
    "--project=$Project" `
    "--freshness=$Freshness" `
    '--limit=1' `
    '--format=json(timestamp,jsonPayload.message)' 2>&1

  if ($LASTEXITCODE -ne 0) {
    throw "gcloud logging read fallo para $stream`: $($raw -join [Environment]::NewLine)"
  }

  $text = ($raw -join [Environment]::NewLine).Trim()
  $entries = if ($text) { @($text | ConvertFrom-Json) } else { @() }
  $latestTimestamp = if ($entries.Count -gt 0) { $entries[0].timestamp } else { $null }

  [ordered]@{
    stream = $stream
    seen = $entries.Count -gt 0
    latestTimestamp = $latestTimestamp
  }
}

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  freshness = $Freshness
  streams = @($results)
} | ConvertTo-Json -Depth 6
