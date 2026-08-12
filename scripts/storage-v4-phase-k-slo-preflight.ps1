param(
  [string]$Project = 'atlasmap-dev',
  [string]$Freshness = '7d',
  [int]$MaxEntriesPerStream = 5000
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este preflight SLO esta bloqueado deliberadamente a atlasmap-dev.'
}
if ($MaxEntriesPerStream -lt 1 -or $MaxEntriesPerStream -gt 20000) {
  throw 'MaxEntriesPerStream debe estar entre 1 y 20000.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

function Read-Stream {
  param([string]$Stream)
  $filter = "jsonPayload.message=`"$Stream`""
  $raw = & gcloud logging read $filter `
    "--project=$Project" `
    "--freshness=$Freshness" `
    "--limit=$MaxEntriesPerStream" `
    '--format=json(timestamp,jsonPayload)' 2>&1

  if ($LASTEXITCODE -ne 0) {
    throw "gcloud logging read fallo para $Stream`: $($raw -join [Environment]::NewLine)"
  }

  $text = ($raw -join [Environment]::NewLine).Trim()
  if (-not $text) { return @() }
  return @($text | ConvertFrom-Json)
}

function Percentile {
  param(
    [object[]]$Values,
    [double]$P
  )
  $numbers = @($Values | ForEach-Object {
    if ($_ -eq $null) { return }
    try {
      $number = [Convert]::ToDouble($_, [Globalization.CultureInfo]::InvariantCulture)
      if (-not [double]::IsNaN($number) -and -not [double]::IsInfinity($number)) {
        $number
      }
    } catch {
      # Ignore malformed telemetry values; the emitted contract already bounds valid durations.
    }
  })
  if ($numbers.Count -eq 0) { return $null }
  $sorted = @($numbers | Sort-Object)
  $index = [Math]::Max(0, [Math]::Min($sorted.Count - 1, [Math]::Ceiling(($P / 100) * $sorted.Count) - 1))
  return [Math]::Round([double]$sorted[$index], 3)
}

function RatioPercent {
  param([int]$Numerator, [int]$Denominator)
  if ($Denominator -le 0) { return $null }
  return [Math]::Round((100.0 * $Numerator) / $Denominator, 3)
}

function Payloads {
  param([object[]]$Entries)
  return @($Entries | ForEach-Object { $_.jsonPayload })
}

$rolloutEntries = Read-Stream 'storage_v4_rollout_metric'
$syncEntries = Read-Stream 'storage_v4_sync_metric'
$cacheEntries = Read-Stream 'storage_v4_provider_cache_metric'
$providerEntries = Read-Stream 'storage_v4_provider_request_metric'

$rollout = Payloads $rolloutEntries
$sync = Payloads $syncEntries
$cache = Payloads $cacheEntries
$provider = Payloads $providerEntries

$rolloutSuccess = @($rollout | Where-Object { [string]$_.outcome -eq 'success' }).Count
$rolloutError = @($rollout | Where-Object { [string]$_.outcome -eq 'error' }).Count
$rolloutMeasured = $rolloutSuccess + $rolloutError

$syncFlush = @($sync | Where-Object { [string]$_.event -eq 'flush' })
$syncSuccess = @($syncFlush | Where-Object { [string]$_.outcome -eq 'success' }).Count
$syncUnexpectedError = @($syncFlush | Where-Object { [string]$_.outcome -eq 'unexpected-error' }).Count
$syncNotLeader = @($syncFlush | Where-Object { [string]$_.outcome -eq 'not-leader' }).Count
$syncMeasured = $syncSuccess + $syncUnexpectedError

$cacheHit = @($cache | Where-Object { [string]$_.outcome -eq 'hit' }).Count
$cacheMiss = @($cache | Where-Object { [string]$_.outcome -eq 'miss' }).Count
$cacheReadError = @($cache | Where-Object { [string]$_.outcome -eq 'read-error' }).Count
$cacheWriteError = @($cache | Where-Object { [string]$_.outcome -eq 'write-error' }).Count
$cacheLookupMeasured = $cacheHit + $cacheMiss

$providerSuccess = @($provider | Where-Object { [string]$_.outcome -eq 'success' }).Count
$providerHttpError = @($provider | Where-Object { [string]$_.outcome -eq 'http-error' }).Count
$providerNetworkError = @($provider | Where-Object { [string]$_.outcome -eq 'network-error' }).Count
$providerParseError = @($provider | Where-Object { [string]$_.outcome -eq 'parse-error' }).Count
$providerMeasured = $providerSuccess + $providerHttpError + $providerNetworkError + $providerParseError

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  freshness = $Freshness
  maxEntriesPerStream = $MaxEntriesPerStream
  note = 'Read-only sample from Cloud Logging. A stream at the entry limit is truncated and cannot be treated as a complete-window SLO.'
  rollout = [ordered]@{
    entries = $rollout.Count
    truncated = $rollout.Count -ge $MaxEntriesPerStream
    success = $rolloutSuccess
    error = $rolloutError
    successRatePercent = RatioPercent $rolloutSuccess $rolloutMeasured
    durationMs = [ordered]@{
      p50 = Percentile @($rollout | ForEach-Object { $_.durationMs }) 50
      p95 = Percentile @($rollout | ForEach-Object { $_.durationMs }) 95
      p99 = Percentile @($rollout | ForEach-Object { $_.durationMs }) 99
    }
  }
  sync = [ordered]@{
    entries = $sync.Count
    truncated = $sync.Count -ge $MaxEntriesPerStream
    flushEntries = $syncFlush.Count
    success = $syncSuccess
    unexpectedError = $syncUnexpectedError
    notLeader = $syncNotLeader
    actionableSuccessRatePercent = RatioPercent $syncSuccess $syncMeasured
    durationMs = [ordered]@{
      p50 = Percentile @($syncFlush | ForEach-Object { $_.durationMs }) 50
      p95 = Percentile @($syncFlush | ForEach-Object { $_.durationMs }) 95
      p99 = Percentile @($syncFlush | ForEach-Object { $_.durationMs }) 99
    }
  }
  providerCache = [ordered]@{
    entries = $cache.Count
    truncated = $cache.Count -ge $MaxEntriesPerStream
    hit = $cacheHit
    miss = $cacheMiss
    readError = $cacheReadError
    writeError = $cacheWriteError
    hitRatePercent = RatioPercent $cacheHit $cacheLookupMeasured
  }
  providerRequest = [ordered]@{
    entries = $provider.Count
    truncated = $provider.Count -ge $MaxEntriesPerStream
    success = $providerSuccess
    httpError = $providerHttpError
    networkError = $providerNetworkError
    parseError = $providerParseError
    successRatePercent = RatioPercent $providerSuccess $providerMeasured
    durationMs = [ordered]@{
      p50 = Percentile @($provider | ForEach-Object { $_.durationMs }) 50
      p95 = Percentile @($provider | ForEach-Object { $_.durationMs }) 95
      p99 = Percentile @($provider | ForEach-Object { $_.durationMs }) 99
    }
  }
} | ConvertTo-Json -Depth 8
